(() => {
  const REQUEST_TYPE = 'X_BOOKMARKS_ORGANIZER_PAGE_REQUEST'
  const RESPONSE_TYPE = 'X_BOOKMARKS_ORGANIZER_PAGE_RESPONSE'
  const transactionIds = []

  const readHeader = (headers, name) => {
    if (!headers) return null

    const target = name.toLowerCase()
    if (headers instanceof Headers) return headers.get(name)

    if (Array.isArray(headers)) {
      const entry = headers.find(([key]) => key.toLowerCase() === target)
      return entry?.[1] ?? null
    }

    if (typeof headers === 'object') {
      const key = Object.keys(headers).find(
        (candidate) => candidate.toLowerCase() === target
      )
      return key ? headers[key] : null
    }

    return null
  }

  const originalFetch = window.fetch
  window.fetch = async function (...args) {
    const [url, options] = args
    const response = await originalFetch.apply(this, args)

    if (typeof url === 'string' && url.includes('/i/api/graphql/')) {
      const transactionId = readHeader(options?.headers, 'x-client-transaction-id')

      if (transactionId) {
        transactionIds.push({id: transactionId, url, timestamp: Date.now()})
        if (transactionIds.length > 10) transactionIds.shift()
      }
    }

    return response
  }

  window.addEventListener('message', (event) => {
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
