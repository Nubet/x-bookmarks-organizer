(() => {
  const REQUEST_TYPE = 'X_BOOKMARKS_ORGANIZER_PAGE_REQUEST'
  const RESPONSE_TYPE = 'X_BOOKMARKS_ORGANIZER_PAGE_RESPONSE'

  interface CapturedTransaction {
    id: string
    url: string
    timestamp: number
  }

  const transactionIds: CapturedTransaction[] = []

  function readHeader(headers: HeadersInit | undefined, name: string) {
    if (!headers) return null

    try {
      return new Headers(headers).get(name)
    } catch {
      return null
    }
  }

  function getRequestUrl(input: RequestInfo | URL) {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.href
    return input.url
  }

  function captureTransactionId(input: RequestInfo | URL, init?: RequestInit) {
    const url = getRequestUrl(input)
    if (!url.includes('/i/api/graphql/')) return

    const transactionId = readHeader(init?.headers, 'x-client-transaction-id')
    if (!transactionId) return

    transactionIds.push({id: transactionId, url, timestamp: Date.now()})
    if (transactionIds.length > 10) transactionIds.shift()
  }

  const originalFetch = window.fetch
  window.fetch = async (...args) => {
    const [input, init] = args
    const response = await originalFetch(...args)
    captureTransactionId(input, init)
    return response
  }

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.data?.type !== REQUEST_TYPE) return

    const {requestId, operation} = event.data
    if (typeof requestId !== 'string' || operation !== 'GET_TRANSACTION_ID') return

    window.postMessage(
      {
        type: RESPONSE_TYPE,
        requestId,
        ok: true,
        data: {transactionId: transactionIds.at(-1)?.id ?? null},
      },
      window.location.origin
    )
  })
})()
