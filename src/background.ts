import type {RuntimeMessage, RuntimeResponse} from './shared/types'
import {
  getLibrary,
  getSettings,
  updateSettings,
  upsertRemoteBookmarks,
  upsertCapturedBookmark,
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
  const tabs = await chrome.tabs.query({active: true, lastFocusedWindow: true})
  const tab = tabs[0]

  if (!tab?.id || !isXUrl(tab.url)) {
    throw new Error('Open an X tab before starting sync')
  }

  await chrome.tabs.sendMessage(tab.id, {type: 'SYNC_RUN'} satisfies RuntimeMessage)
  return {status: 'started'}
}

function isXUrl(url: string | undefined) {
  return Boolean(url && /^https:\/\/(www\.)?(x|twitter)\.com\//.test(url))
}
