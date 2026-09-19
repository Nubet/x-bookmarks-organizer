import {sendRuntimeMessage} from '../shared/runtime'
import type {ExtensionSettings} from '../shared/types'
import {observeBookmarkButtons, saveCapturedBookmark} from './bookmark-observer'
import {fetchBookmarkPage, getLatestTransactionId, installPageScript} from './page-bridge'
import {refreshBookmarksView, watchBookmarksRoute, watchIntegrationToggle} from './bookmarks-view'

export default function initial() {
  installPageScript()
  let stopObserving = () => {}
  let stopBookmarksView = () => {}
  let stopIntegrationToggle = () => {}
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
    stopIntegrationToggle()
  }

  async function start() {
    const response = await sendRuntimeMessage<ExtensionSettings>({
      type: 'SETTINGS_GET',
    })

    if (disposed || !response.ok) return

    if (!response.data.pageIntegration) {
      stopIntegrationToggle = watchIntegrationToggle()
      return
    }

    stopObserving = observeBookmarkButtons(saveCapturedBookmark)
    stopBookmarksView = watchBookmarksRoute()

    void getLatestTransactionId().catch(() => undefined)
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
    refreshBookmarksView()
    return {status: `Synced ${bookmarks.length} bookmarks`}
  }

}
