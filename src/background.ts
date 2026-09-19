import type {RuntimeMessage, RuntimeResponse} from './shared/types'
import {getLibrary, getSettings, updateSettings} from './storage/repositories'

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
      case 'SETTINGS_GET':
        return {ok: true, data: await getSettings()}
      case 'SETTINGS_UPDATE':
        return {ok: true, data: await updateSettings(message.settings)}
      case 'SYNC_START':
        return {ok: true, data: {status: 'not-implemented'}}
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Storage operation failed',
    }
  }
}
