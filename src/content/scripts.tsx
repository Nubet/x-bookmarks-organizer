import {sendRuntimeMessage} from '../shared/runtime'
import type {ExtensionSettings, RuntimeMessage, SyncMode, SyncPageResult, SyncState} from '../shared/types'
import {fetchBookmarkPage} from './page-bridge'
import {refreshBookmarksView, resetBookmarksView, setAutoSyncEnabled, setSyncError, setSyncProgress, watchBookmarksRoute, watchIntegrationToggle} from './bookmarks-view'
import {isBookmarksRoute, watchRouteChanges} from './route'
import {readAccountId, requireAccountId} from './account-session'
import {watchNativeBookmarkActions} from './native-bookmark-observer'

export default function initial() {
  let stopBookmarksView = () => {}
  let stopRouteChanges = () => {}
  let refreshOrganizer = refreshBookmarksView
  let integrationEnabled: boolean | null = null
  let accountId: string | null = null
  let accountCheckTimer: number | null = null
  let libraryChangeTimer: number | null = null
  let accountGeneration = 0
  let syncFlight: Promise<unknown> | null = null
  let viewActive = false
  let disposed = false
  let autoSyncRequested = false
  let nativeSyncTimer: number | null = null
  let settingsAutoSync = true

  const handleMessage = (message: RuntimeMessage, _sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
    if (message.type === 'LIBRARY_CHANGED') {
      if (message.accountId !== readAccountId()) return
      if (libraryChangeTimer !== null) window.clearTimeout(libraryChangeTimer)
      libraryChangeTimer = window.setTimeout(() => {
        libraryChangeTimer = null
        refreshOrganizer()
      }, 300)
      return
    }

    if (message.type === 'SYNC_PROGRESS') {
      if (message.accountId === readAccountId()) setSyncProgress(message)
      return
    }

    if (message.type === 'SYNC_FINISHED') {
      if (message.accountId === readAccountId()) {
        setSyncError(null)
        setSyncProgress(null)
      }
      return
    }

    if (message.type === 'SYNC_FAILED') {
      if (message.accountId === readAccountId()) {
        setSyncProgress(null)
        setSyncError(message.error)
      }
      return
    }

    if (message.type === 'SETTINGS_CHANGED') {
      const viewChanged = integrationEnabled !== null && integrationEnabled !== message.settings.pageIntegration
      integrationEnabled = message.settings.pageIntegration
      settingsAutoSync = message.settings.autoSync
      setAutoSyncEnabled(message.settings.autoSync)
      if (!message.settings.autoSync) {
        autoSyncRequested = false
      }
      if (viewChanged && viewActive) {
        stopBookmarksView()
        stopBookmarksView = () => {}
        viewActive = false
      }
      syncOrganizer()
      return
    }

    if (message.type !== 'SYNC_RUN') return
    if (message.accountId && message.accountId !== readAccountId()) {
      sendResponse({ok: false, error: 'X account changed before sync started'})
      return
    }

    if (!syncFlight) {
      syncFlight = runSync().finally(() => {
        syncFlight = null
      })
    }

    void syncFlight
      .then((data) => sendResponse({ok: true, data}))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Sync failed',
        })
      )

    return true
  }

  chrome.runtime.onMessage.addListener(handleMessage)

  stopRouteChanges = watchRouteChanges(syncOrganizer)
  const stopNativeBookmarkActions = watchNativeBookmarkActions((capture, removing) => {
    const currentAccountId = readAccountId()
    if (!currentAccountId) return

    void sendRuntimeMessage(
      removing
        ? {type: 'BOOKMARK_REMOVE_LOCAL', accountId: currentAccountId, tweetId: capture.tweetId}
        : {type: 'BOOKMARK_CAPTURE_LOCAL', accountId: currentAccountId, bookmark: capture}
    ).then(() => {
      if (removing || !settingsAutoSync) return
      if (nativeSyncTimer !== null) window.clearTimeout(nativeSyncTimer)
      nativeSyncTimer = window.setTimeout(() => {
        nativeSyncTimer = null
        requestAutoSync(currentAccountId)
      }, 2000)
    })
  })
  void start()

  return () => {
    disposed = true
    stopBookmarksView()
    stopRouteChanges()
    stopNativeBookmarkActions()
    chrome.runtime.onMessage.removeListener(handleMessage)
    if (accountCheckTimer !== null) window.clearInterval(accountCheckTimer)
    if (libraryChangeTimer !== null) window.clearTimeout(libraryChangeTimer)
    if (nativeSyncTimer !== null) window.clearTimeout(nativeSyncTimer)
  }

  async function start() {
    const response = await sendRuntimeMessage<ExtensionSettings>({
      type: 'SETTINGS_GET',
    })

    if (disposed || !response.ok) return

    integrationEnabled = response.data.pageIntegration
    accountId = readAccountId()
    settingsAutoSync = response.data.autoSync
    setAutoSyncEnabled(response.data.autoSync)
    accountCheckTimer = window.setInterval(checkAccount, 2000)

    syncOrganizer()
  }

  function checkAccount() {
    const nextAccountId = readAccountId()
    if (nextAccountId === accountId) return

    accountId = nextAccountId
    accountGeneration += 1
    autoSyncRequested = false
    resetBookmarksView()

    syncOrganizer()
  }

  function syncOrganizer() {
    if (integrationEnabled === null) return

    if (!accountId || !isBookmarksRoute()) {
      autoSyncRequested = false
      if (viewActive) {
        stopBookmarksView()
        stopBookmarksView = () => {}
        viewActive = false
      }
      return
    }

    if (!viewActive) {
      viewActive = true
      stopBookmarksView = integrationEnabled
        ? watchBookmarksRoute(() => applyIntegrationSetting(false))
        : watchIntegrationToggle(() => applyIntegrationSetting(true))
    }

    if (settingsAutoSync && !autoSyncRequested) requestAutoSync(accountId)
  }

  function applyIntegrationSetting(enabled: boolean) {
    if (integrationEnabled === enabled) return

    integrationEnabled = enabled
    if (viewActive) {
      stopBookmarksView()
      stopBookmarksView = () => {}
      viewActive = false
    }
    syncOrganizer()
  }

  function requestAutoSync(requestAccountId: string | null) {
    if (!settingsAutoSync || !requestAccountId) return

    autoSyncRequested = true
    void sendRuntimeMessage({type: 'AUTO_SYNC_REQUEST', accountId: requestAccountId}).then((response) => {
      if (!response.ok) {
        autoSyncRequested = false
      }
    })
  }

  async function runSync() {
    setSyncError(null)
    const syncAccountId = requireAccountId()
    const syncGeneration = accountGeneration
    const assertCurrentOperation = () => {
      if (readAccountId() !== syncAccountId || accountGeneration !== syncGeneration) {
        throw new Error('X account changed during sync. Run sync again.')
      }
    }

    assertCurrentOperation()
    const syncStateResponse = await sendRuntimeMessage<SyncState>({type: 'SYNC_STATE_GET', accountId: syncAccountId})
    if (!syncStateResponse.ok) throw new Error(syncStateResponse.error)
    const mode: SyncMode = syncStateResponse.data.mode
    const seenCursors = new Set<string>()
    let cursor: string | null = null
    let total = 0
    let completed = false

    try {
      for (let page = 0; page < 50; page += 1) {
        assertCurrentOperation()
        const result = await fetchBookmarkPage(cursor)
        assertCurrentOperation()

        const response = await sendRuntimeMessage<SyncPageResult>({
          type: 'BOOKMARKS_SYNC',
          accountId: syncAccountId,
          bookmarks: result.bookmarks,
          mode,
          nextCursor: result.nextCursor,
        })
        if (!response.ok) throw new Error(response.error)
        assertCurrentOperation()
        total += result.bookmarks.length

        if (response.data.stop || !result.nextCursor || result.bookmarks.length === 0) {
          completed = true
          break
        }
        if (seenCursors.has(result.nextCursor)) break
        seenCursors.add(result.nextCursor)
        cursor = result.nextCursor
      }

      assertCurrentOperation()
      const finishResponse = await sendRuntimeMessage({type: 'SYNC_FINISH', accountId: syncAccountId, mode, completed})
      if (!finishResponse.ok) throw new Error(finishResponse.error)
    } catch (error) {
      setSyncProgress(null)
      setSyncError(error instanceof Error ? error.message : 'Sync failed')
      if (readAccountId() === syncAccountId && accountGeneration === syncGeneration) {
        await sendRuntimeMessage({type: 'SYNC_FAILED', accountId: syncAccountId, error: error instanceof Error ? error.message : 'Sync failed'})
      }
      throw error
    }

    refreshOrganizer()
    return {status: `${mode === 'delta' ? 'Checked' : 'Synced'} ${total} bookmarks`}
  }

}
