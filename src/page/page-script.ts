(() => {
  const REQUEST_TYPE = 'X_BOOKMARKS_ORGANIZER_PAGE_REQUEST'
  const RESPONSE_TYPE = 'X_BOOKMARKS_ORGANIZER_PAGE_RESPONSE'
  const BOOKMARKS_ENDPOINT =
    'https://x.com/i/api/graphql/QUjXply7fA7fk05FRyajEg/Bookmarks'
  const BEARER_TOKEN =
    'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

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

    const transactionId = readHeader(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
      'x-client-transaction-id'
    )
    if (!transactionId) return

    transactionIds.push({id: transactionId, url, timestamp: Date.now()})
    if (transactionIds.length > 10) transactionIds.shift()
  }

  async function fetchBookmarks(cursor: string | null) {
    const csrfToken = document.cookie.match(/(?:^|; )ct0=([^;]+)/)?.[1]
    if (!csrfToken) throw new Error('X CSRF token not found')

    const variables = {
      count: 100,
      includePromotedContent: true,
      ...(cursor ? {cursor} : {}),
    }
    const features = {
      graphql_timeline_v2_bookmark_timeline: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      longform_notetweets_consumption_enabled: true,
      articles_preview_enabled: true,
      view_counts_everywhere_api_enabled: true,
    }
    const query = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(features),
    })
    const response = await originalFetch(`${BOOKMARKS_ENDPOINT}?${query}`, {
      credentials: 'include',
      headers: {
        accept: '*/*',
        authorization: BEARER_TOKEN,
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
        'x-client-transaction-id':
          transactionIds.at(-1)?.id ?? createFallbackTransactionId(),
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en',
      },
    })

    if (!response.ok) throw new Error(`X bookmark sync failed: HTTP ${response.status}`)

    return parseBookmarkPage(await response.json(), cursor)
  }

  function parseBookmarkPage(data: unknown, cursor: string | null) {
    const entries = readEntries(data)
    const bookmarks = entries
      .filter((entry) => entry.entryId?.startsWith('tweet-'))
      .map((entry) => {
        const result = entry.content?.itemContent?.tweet_results?.result
        const user = result?.core?.user_results?.result
        const username = user?.core?.screen_name ?? user?.legacy?.screen_name
        const name = user?.core?.name ?? user?.legacy?.name ?? username
        const tweetId = result?.rest_id
        const text = result?.note_tweet?.note_tweet_results?.result?.text ?? result?.legacy?.full_text

        if (
          typeof tweetId !== 'string' ||
          typeof text !== 'string' ||
          typeof username !== 'string' ||
          typeof name !== 'string'
        ) {
          return null
        }

        return {
          tweetId,
          text,
          author: {name, username},
        }
      })
      .filter((bookmark): bookmark is NonNullable<typeof bookmark> => bookmark !== null)

    const cursorEntry = entries.find((entry) => entry.entryId?.startsWith('cursor-bottom-'))
    const candidateCursor = cursorEntry?.content?.value

    return {
      bookmarks,
      nextCursor:
        typeof candidateCursor === 'string' && candidateCursor !== cursor
          ? candidateCursor
          : null,
    }
  }

  function readEntries(data: unknown) {
    const value = data as {
      data?: {bookmark_timeline_v2?: {timeline?: {instructions?: Array<{entries?: unknown[]}>}}}
    }
    const entries = value.data?.bookmark_timeline_v2?.timeline?.instructions?.flatMap(
      (instruction) => instruction.entries ?? []
    )

    return (entries ?? []).filter(isTimelineEntry)
  }

  function isTimelineEntry(value: unknown): value is TimelineEntry {
    return Boolean(value && typeof value === 'object' && 'entryId' in value)
  }

  function createFallbackTransactionId() {
    const bytes = new Uint8Array(86)
    crypto.getRandomValues(bytes)
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
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

    const {requestId, operation, payload} = event.data
    if (typeof requestId !== 'string') return

    void (async () => {
      try {
        const data =
          operation === 'GET_TRANSACTION_ID'
            ? {transactionId: transactionIds.at(-1)?.id ?? null}
            : operation === 'FETCH_BOOKMARKS'
              ? await fetchBookmarks(payload?.cursor ?? null)
              : (() => {
                  throw new Error(`Unknown page operation: ${operation}`)
                })()

        window.postMessage(
          {type: RESPONSE_TYPE, requestId, ok: true, data},
          window.location.origin
        )
      } catch (error) {
        window.postMessage(
          {
            type: RESPONSE_TYPE,
            requestId,
            ok: false,
            error: error instanceof Error ? error.message : 'Page operation failed',
          },
          window.location.origin
        )
      }
    })()
  })

  interface TimelineEntry {
    entryId?: string
    content?: {
      value?: string
      itemContent?: {
        tweet_results?: {
          result?: {
            rest_id?: string
            legacy?: {full_text?: string}
            note_tweet?: {note_tweet_results?: {result?: {text?: string}}}
            core?: {
              user_results?: {
                result?: {
                  core?: {name?: string; screen_name?: string}
                  legacy?: {name?: string; screen_name?: string}
                }
              }
            }
          }
        }
      }
    }
  }
})()
