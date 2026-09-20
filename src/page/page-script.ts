(() => {
  const REQUEST_TYPE = 'X_BOOKMARKS_ORGANIZER_PAGE_REQUEST'
  const RESPONSE_TYPE = 'X_BOOKMARKS_ORGANIZER_PAGE_RESPONSE'
  const BOOKMARKS_ENDPOINT =
    'https://x.com/i/api/graphql/QUjXply7fA7fk05FRyajEg/Bookmarks'
  const DELETE_BOOKMARK_ENDPOINT =
    'https://x.com/i/api/graphql/Wlmlj2-xzyS1GN3a6cj-mQ/DeleteBookmark'
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
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      longform_notetweets_consumption_enabled: true,
      articles_preview_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_enhance_cards_enabled: false,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      rweb_video_timestamps_enabled: true,
    }
    const query = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(features),
    })
    const response = await originalFetch(`${BOOKMARKS_ENDPOINT}?${query}`, {
      credentials: 'include',
      referrer: `${location.origin}/i/history`,
      referrerPolicy: 'strict-origin-when-cross-origin',
      headers: {
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9',
        authorization: BEARER_TOKEN,
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
        'x-client-transaction-id':
          transactionIds.at(-1)?.id ?? createFallbackTransactionId(),
        'x-client-uuid': crypto.randomUUID(),
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en',
      },
    })

    if (!response.ok) throw new Error(`X bookmark sync failed: HTTP ${response.status}`)

    const data = await response.json()
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      throw new Error(data.errors[0]?.message ?? 'X returned a bookmark sync error')
    }

    const page = parseBookmarkPage(data, cursor)
    if (!page.bookmarks.length && !page.nextCursor && cursor === null) {
      throw new Error('X returned no bookmark entries. Refresh the X page and try again.')
    }

    return page
  }

  async function deleteBookmark(tweetId: string) {
    if (!/^\d+$/.test(tweetId)) throw new Error('Invalid X tweet ID')

    const csrfToken = document.cookie.match(/(?:^|; )ct0=([^;]+)/)?.[1]
    if (!csrfToken) throw new Error('X CSRF token not found')

    const headers: Record<string, string> = {
      accept: '*/*',
      authorization: BEARER_TOKEN,
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
      'x-client-transaction-id': transactionIds.at(-1)?.id ?? createFallbackTransactionId(),
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'en',
    }
    const xpForwardedFor = await getXpForwardedFor()
    if (xpForwardedFor) headers['x-xp-forwarded-for'] = xpForwardedFor

    const response = await originalFetch(DELETE_BOOKMARK_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        variables: {tweet_id: tweetId},
        queryId: 'Wlmlj2-xzyS1GN3a6cj-mQ',
      }),
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      if (response.status === 404) return {success: true}
      const message = data?.errors?.[0]?.message
      throw new Error(message ? `X bookmark mutation failed: ${message}` : `X bookmark mutation failed: HTTP ${response.status}`)
    }

    const result = data?.data?.tweet_bookmark_delete
    if (result !== 'Done') throw new Error('X returned an unexpected bookmark response')
    return {success: true}
  }

  async function getXpForwardedFor() {
    const sdk = (window as Window & {
      XPForwardedForSDK?: {getForwardedForStr?: () => Promise<{str?: string}>}
    }).XPForwardedForSDK

    if (!sdk?.getForwardedForStr) return null

    try {
      return (await sdk.getForwardedForStr()).str ?? null
    } catch {
      return null
    }
  }

  function parseBookmarkPage(data: unknown, cursor: string | null) {
    const entries = readEntries(data)
    const bookmarks = entries
      .filter((entry) => entry.entryId?.startsWith('tweet-'))
      .map((entry) => {
        const rawResult = entry.content?.itemContent?.tweet_results?.result
        const result = rawResult?.tweet ?? rawResult
        const user = result?.core?.user_results?.result
        const username = user?.core?.screen_name ?? user?.legacy?.screen_name
        const name = user?.core?.name ?? user?.legacy?.name ?? username
        const tweetId = result?.rest_id
        const text = result?.note_tweet?.note_tweet_results?.result?.text ?? result?.legacy?.full_text
        const media = readMedia(result?.legacy)

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
          avatarUrl: user?.avatar?.image_url ?? user?.legacy?.profile_image_url_https,
          postedAt: result?.legacy?.created_at,
          media,
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
    const instructionList = findInstructionList(data)
    const entries = instructionList?.flatMap((instruction) => instruction.entries ?? [])

    return (entries ?? []).filter(isTimelineEntry)
  }

  function findInstructionList(value: unknown, depth = 0): Array<{entries?: unknown[]}> | null {
    if (depth > 8 || !value || typeof value !== 'object') return null

    if (Array.isArray(value)) {
      if (value.some(isTimelineInstruction)) return value.filter(isTimelineInstruction)
      for (const item of value) {
        const result = findInstructionList(item, depth + 1)
        if (result) return result
      }
      return null
    }

    for (const child of Object.values(value)) {
      const result = findInstructionList(child, depth + 1)
      if (result) return result
    }

    return null
  }

  function isTimelineInstruction(value: unknown): value is {entries?: unknown[]} {
    return Boolean(value && typeof value === 'object' && Array.isArray((value as {entries?: unknown[]}).entries))
  }

  function readMedia(legacy: TweetLegacy | undefined): NormalizedMedia[] {
    const media = legacy?.extended_entities?.media ?? legacy?.entities?.media ?? []

    return media.flatMap((item) => {
      if (typeof item.media_url_https !== 'string') return [] as NormalizedMedia[]

      if (item.type === 'video' || item.type === 'animated_gif') {
        const video = (item.video_info?.variants ?? [])
          .filter((variant) => variant.content_type === 'video/mp4' && typeof variant.url === 'string')
          .sort((left, right) => (right.bitrate ?? 0) - (left.bitrate ?? 0))[0]

        return [{
          type: 'video' as const,
          url: video?.url ?? item.media_url_https,
          previewUrl: item.media_url_https,
        }] as NormalizedMedia[]
      }

      return [{type: 'image' as const, url: item.media_url_https}] as NormalizedMedia[]
    })
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
              : operation === 'DELETE_BOOKMARK'
                ? await deleteBookmark(payload?.tweetId)
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
              tweet?: {
                rest_id?: string
                legacy?: TweetLegacy
                note_tweet?: {note_tweet_results?: {result?: {text?: string}}}
                core?: {
                  user_results?: {
                    result?: {
                      core?: {name?: string; screen_name?: string}
                      legacy?: {name?: string; screen_name?: string; profile_image_url_https?: string}
                      avatar?: {image_url?: string}
                    }
                  }
                }
              }
              rest_id?: string
            legacy?: TweetLegacy
            note_tweet?: {note_tweet_results?: {result?: {text?: string}}}
            core?: {
              user_results?: {
                result?: {
                  core?: {name?: string; screen_name?: string}
                  legacy?: {name?: string; screen_name?: string; profile_image_url_https?: string}
                  avatar?: {image_url?: string}
                }
              }
            }
          }
        }
      }
    }
  }

  interface MediaEntry {
    type?: string
    media_url_https?: string
    video_info?: {
      variants?: Array<{url?: string; content_type?: string; bitrate?: number}>
    }
  }

  interface TweetLegacy {
    full_text?: string
    created_at?: string
    entities?: {media?: MediaEntry[]}
    extended_entities?: {media?: MediaEntry[]}
  }

  interface NormalizedMedia {
    type: 'image' | 'video'
    url: string
    previewUrl?: string
  }
})()
