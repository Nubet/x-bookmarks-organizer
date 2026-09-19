import type {RuntimeMessage, RuntimeResponse} from './types'

export function sendRuntimeMessage<T>(
  message: RuntimeMessage
): Promise<RuntimeResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: RuntimeResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: chrome.runtime.lastError.message ?? 'Runtime message failed',
        })
        return
      }

      resolve(response ?? {ok: false, error: 'Empty runtime response'})
    })
  })
}
