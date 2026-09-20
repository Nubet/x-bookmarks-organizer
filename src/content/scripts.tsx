import {sendRuntimeMessage} from '../shared/runtime'
import type {ExtensionSettings} from '../shared/types'
import {fetchBookmarkPage} from './page-bridge'
import {refreshBookmarksView, resetBookmarksView, watchBookmarksRoute, watchIntegrationToggle} from './bookmarks-view'
import {isBookmarksRoute, watchRouteChanges} from './route'
import {readAccountId, requireAccountId} from './account-session'

export default function initial() {
  let stopBookmarksView = () => {}
  let stopRouteChanges = () => {}
  let refreshOrganizer = refreshBookmarksView
  let integrationEnabled: boolean | null = null
  let accountId: string | null = null
  let accountCheckTimer: number | null = null
  let viewActive = false
  let disposed = false

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'SYNC_RUN') return

    void runSync()
      .then((data) => sendResponse({ok: true, data}))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Sync failed',
        })
      )

    return true
  })

  stopRouteChanges = watchRouteChanges(syncOrganizer)
  void start()

  return () => {
    disposed = true
    stopBookmarksView()
    stopRouteChanges()
    if (accountCheckTimer !== null) window.clearInterval(accountCheckTimer)
  }

  async function start() {
    const response = await sendRuntimeMessage<ExtensionSettings>({
      type: 'SETTINGS_GET',
    })

    if (disposed || !response.ok) return

    integrationEnabled = response.data.pageIntegration
    accountId = readAccountId()
    accountCheckTimer = window.setInterval(checkAccount, 2000)

    syncOrganizer()
  }

  function checkAccount() {
    const nextAccountId = readAccountId()
    if (nextAccountId === accountId) return

    accountId = nextAccountId
    resetBookmarksView()

    syncOrganizer()
  }

  function syncOrganizer() {
    if (integrationEnabled === null) return

    if (!accountId || !isBookmarksRoute()) {
      if (viewActive) {
        stopBookmarksView()
        stopBookmarksView = () => {}
        viewActive = false
      }
      return
    }

    if (viewActive) return
    viewActive = true
    stopBookmarksView = integrationEnabled
      ? watchBookmarksRoute()
      : watchIntegrationToggle()
  }

  async function runSync() {
    const syncAccountId = requireAccountId()
    const seenCursors = new Set<string>()
    let cursor: string | null = null
    let total = 0

    for (let page = 0; page < 50; page += 1) {
      if (readAccountId() !== syncAccountId) throw new Error('X account changed during sync. Run sync again.')
      const result = await fetchBookmarkPage(cursor)

      if (result.bookmarks.length === 0) break

      const response = await sendRuntimeMessage({type: 'BOOKMARKS_SYNC', accountId: syncAccountId, bookmarks: result.bookmarks})
      if (!response.ok) throw new Error(response.error)
      total += result.bookmarks.length

      if (!result.nextCursor || seenCursors.has(result.nextCursor)) break
      seenCursors.add(result.nextCursor)
      cursor = result.nextCursor
    }

    refreshOrganizer()
    return {status: `Synced ${total} bookmarks`}
  }

}
