import {sendRuntimeMessage} from '../shared/runtime'
import type {ExtensionSettings} from '../shared/types'
import {observeBookmarkButtons, saveCapturedBookmark} from './bookmark-observer'
import {fetchBookmarkPage, getLatestTransactionId, installPageScript} from './page-bridge'

export default function initial() {
  installPageScript()
  let stopObserving = () => {}
  let disposed = false

  void start()

  return () => {
    disposed = true
    stopObserving()
  }

  async function start() {
    const response = await sendRuntimeMessage<ExtensionSettings>({
      type: 'SETTINGS_GET',
    })

    if (disposed || !response.ok || !response.data.pageIntegration) return

    stopObserving = observeBookmarkButtons(saveCapturedBookmark)

    void getLatestTransactionId().catch(() => undefined)
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'SYNC_RUN') return

    void runSync()
  })

  async function runSync() {
    const bookmarks = []
    const seenCursors = new Set<string>()
    let cursor: string | null = null

    for (let page = 0; page < 50; page += 1) {
      const result = await fetchBookmarkPage(cursor)
      bookmarks.push(...result.bookmarks)

      if (!result.nextCursor || seenCursors.has(result.nextCursor)) break
      seenCursors.add(result.nextCursor)
      cursor = result.nextCursor
    }

    await sendRuntimeMessage({type: 'BOOKMARKS_SYNC', bookmarks})
  }
}
