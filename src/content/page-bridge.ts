const REQUEST_TYPE = 'X_BOOKMARKS_ORGANIZER_PAGE_REQUEST'
const RESPONSE_TYPE = 'X_BOOKMARKS_ORGANIZER_PAGE_RESPONSE'
const PAGE_SCRIPT_PATH = 'page/page-script.js'
const REQUEST_TIMEOUT_MS = 3000

let requestCounter = 0

export function installPageScript() {
  if (document.querySelector(`script[data-x-bookmarks-organizer-page]`)) {
    return
  }

  const script = document.createElement('script')
  script.src = chrome.runtime.getURL(PAGE_SCRIPT_PATH)
  script.dataset.xBookmarksOrganizerPage = 'true'
  script.async = false

  const parent = document.head ?? document.documentElement
  parent?.prepend(script)
}

export function getLatestTransactionId() {
  const requestId = `request-${Date.now()}-${requestCounter++}`

  return new Promise<string | null>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handleResponse)
      reject(new Error('Page bridge response timed out'))
    }, REQUEST_TIMEOUT_MS)

    function handleResponse(event: MessageEvent) {
      if (event.source !== window || event.data?.type !== RESPONSE_TYPE) return
      if (event.data.requestId !== requestId) return

      window.clearTimeout(timeout)
      window.removeEventListener('message', handleResponse)

      if (event.data.ok) {
        resolve(event.data.data.transactionId ?? null)
      } else {
        reject(new Error(event.data.error ?? 'Page bridge request failed'))
      }
    }

    window.addEventListener('message', handleResponse)
    window.postMessage(
      {type: REQUEST_TYPE, requestId, operation: 'GET_TRANSACTION_ID'},
      window.location.origin
    )
  })
}
