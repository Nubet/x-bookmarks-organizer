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

    const integrationEnabled = response.data.pageIntegration

    if (integrationEnabled) {
      stopObserving = observeBookmarkButtons(saveCapturedBookmark)
    }

    let viewActive = false
    const mountOrganizer = () => {
      if (viewActive || !isBookmarksRoute()) return
      viewActive = true
      stopBookmarksView = integrationEnabled
        ? watchBookmarksRoute()
        : watchIntegrationToggle()
    }

    const syncOrganizer = () => {
      if (!isBookmarksRoute()) {
        if (viewActive) {
          stopBookmarksView()
          stopBookmarksView = () => {}
          viewActive = false
        }
        return
      }

      mountOrganizer()
    }

    stopRouteChanges = watchRouteChanges(syncOrganizer)
    syncOrganizer()
  }

  async function runSync() {
    const bookmarks = []
    const seenCursors = new Set<string>()
    let cursor: string | null = null

    for (let page = 0; page < 50; page += 1) {
      const result = await fetchBookmarkPage(cursor)
      bookmarks.push(...result.bookmarks)

      if (result.bookmarks.length === 0) break
      if (!result.nextCursor || seenCursors.has(result.nextCursor)) break
      seenCursors.add(result.nextCursor)
      cursor = result.nextCursor
    }

    const response = await sendRuntimeMessage({type: 'BOOKMARKS_SYNC', bookmarks})
    if (!response.ok) throw new Error(response.error)
    refreshOrganizer()
    return {status: `Synced ${bookmarks.length} bookmarks`}
  }

}
