import type {RuntimeMessage, RuntimeResponse} from './shared/types'
import {
  getLibrary,
  getBookmarkPage,
  getSettings,
  updateSettings,
  upsertRemoteBookmarks,
  upsertCapturedBookmark,
  deleteBookmark,
} from './storage/repositories'

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    _sender,
    sendResponse: (response: RuntimeResponse<unknown>) => void
  ) => {
    void handleMessage(message).then(sendResponse)
    return true
  }
)

async function handleMessage(
  message: RuntimeMessage
): Promise<RuntimeResponse<unknown>> {
  try {
    switch (message.type) {
      case 'LIBRARY_GET':
        return {ok: true, data: await getLibrary()}
      case 'BOOKMARK_SAVE':
        return {ok: true, data: await upsertCapturedBookmark(message.bookmark)}
      case 'BOOKMARK_DELETE':
        return {ok: true, data: await deleteBookmark(message.tweetId)}
      case 'BOOKMARKS_SYNC':
        return {ok: true, data: await upsertRemoteBookmarks(message.bookmarks)}
      case 'SETTINGS_GET':
        return {ok: true, data: await getSettings()}
      case 'SETTINGS_UPDATE':
        return {ok: true, data: await updateSettings(message.settings)}
      case 'SYNC_START':
        return {ok: true, data: await startSync()}
      case 'SYNC_RUN':
        return {ok: false, error: 'SYNC_RUN is only valid in a content script'}
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Storage operation failed',
    }
  }
}

async function startSync() {
  const tabs = await chrome.tabs.query({active: true})

  for (const tab of tabs) {
    if (!tab.id) continue

    let response: RuntimeResponse<unknown>
    try {
      response = await chrome.tabs.sendMessage(
        tab.id,
        {type: 'SYNC_RUN'} satisfies RuntimeMessage
      )
    } catch {
      continue
    }

    if (response?.ok) return response.data
    throw new Error(response?.error ?? 'Sync failed in the X tab')
  }

  throw new Error('Open or reload an X tab before starting sync')
}
