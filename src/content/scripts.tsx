import {sendRuntimeMessage} from '../shared/runtime'
import type {ExtensionSettings} from '../shared/types'
import {observeBookmarkButtons, saveCapturedBookmark} from './bookmark-observer'
import {fetchBookmarkPage} from './page-bridge'
import {refreshBookmarksView, watchBookmarksRoute, watchIntegrationToggle} from './bookmarks-view'
import {isBookmarksRoute, watchRouteChanges} from './route'

export default function initial() {
  let stopObserving = () => {}
  let stopBookmarksView = () => {}
  let stopRouteChanges = () => {}
  let refreshOrganizer = refreshBookmarksView
  let integrationEnabled: boolean | null = null
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
    stopObserving()
    stopBookmarksView()
    stopRouteChanges()
  }

  async function start() {
    const response = await sendRuntimeMessage<ExtensionSettings>({
      type: 'SETTINGS_GET',
    })

    if (disposed || !response.ok) return

    integrationEnabled = response.data.pageIntegration

    if (integrationEnabled) {
      stopObserving = observeBookmarkButtons(saveCapturedBookmark)
    }

    syncOrganizer()
  }

  function syncOrganizer() {
    if (integrationEnabled === null) return

    if (!isBookmarksRoute()) {
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
    const seenCursors = new Set<string>()
    let cursor: string | null = null
    let total = 0

    for (let page = 0; page < 50; page += 1) {
      const result = await fetchBookmarkPage(cursor)

      if (result.bookmarks.length === 0) break

      const response = await sendRuntimeMessage({type: 'BOOKMARKS_SYNC', bookmarks: result.bookmarks})
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
