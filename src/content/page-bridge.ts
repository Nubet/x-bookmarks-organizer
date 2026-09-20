const REQUEST_TYPE = 'X_BOOKMARKS_ORGANIZER_PAGE_REQUEST'
const RESPONSE_TYPE = 'X_BOOKMARKS_ORGANIZER_PAGE_RESPONSE'
const PAGE_SCRIPT_PATH = 'page/page-script.js'
const REQUEST_TIMEOUT_MS = 15000

let requestCounter = 0
let pageScriptPromise: Promise<void> | null = null

export function installPageScript() {
  if (document.querySelector(`script[data-x-bookmarks-organizer-page]`)) {
    return Promise.resolve()
  }

  if (pageScriptPromise) return pageScriptPromise

  pageScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = chrome.runtime.getURL(PAGE_SCRIPT_PATH)
    script.dataset.xBookmarksOrganizerPage = 'true'
    script.async = false
    script.onload = () => resolve()
    script.onerror = () => {
      pageScriptPromise = null
      reject(new Error('Could not load the X page bridge'))
    }

    const parent = document.head ?? document.documentElement
    parent?.prepend(script)
  })

  return pageScriptPromise
}

export function getLatestTransactionId() {
  return requestPageOperation<{transactionId: string | null}>('GET_TRANSACTION_ID')
}

export function fetchBookmarkPage(cursor: string | null) {
  return requestPageOperation<{
    bookmarks: Array<{
      tweetId: string
      text: string
      author: {name: string; username: string}
    }>
    nextCursor: string | null
  }>('FETCH_BOOKMARKS', {cursor})
}

export function deleteBookmark(tweetId: string) {
  return requestPageOperation<{success: true}>('DELETE_BOOKMARK', {tweetId})
}

async function requestPageOperation<T>(operation: string, payload?: unknown) {
  await installPageScript()

  const requestId = `request-${Date.now()}-${requestCounter++}`

  return new Promise<T>((resolve, reject) => {
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
        resolve(event.data.data as T)
      } else {
        reject(new Error(event.data.error ?? 'Page bridge request failed'))
      }
    }

    window.addEventListener('message', handleResponse)
    window.postMessage(
      {type: REQUEST_TYPE, requestId, operation, payload},
      window.location.origin
    )
  })
}
