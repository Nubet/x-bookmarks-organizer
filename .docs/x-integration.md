# X Integration

The extension does not use a separate bookmark service. It reads and mutates the signed-in X session from the X page itself. This is difficult because the extension has to cross the content-script isolation boundary and because X's response shape is not a stable application-level API.

## Page-context bridge

`src/content/page-bridge.ts` is the content-side client. `src/page/page-script.ts` is injected into the page context and owns the actual X requests.

The two contexts communicate with `window.postMessage`:

```ts
window.postMessage(
  {type: REQUEST_TYPE, requestId, operation, payload},
  window.location.origin
)
```

Responses are accepted only when the source, response type, and request ID match:

```ts
if (event.source !== window || event.data?.type !== RESPONSE_TYPE) return
if (event.data.requestId !== requestId) return
```

Each request has a 15-second timeout. This prevents a failed injection or stalled X request from leaving sync permanently pending.

The bridge posts to `window.location.origin` and checks `event.source === window`, but it does not perform a separate `event.origin` comparison. Its practical correlation boundary is the private request ID generated for each pending operation. The bridge is an internal page integration boundary, not a general cross-origin message API.

The page script is installed at `document_start`. Installation is promise-cached, so simultaneous callers wait for one script load rather than adding multiple page listeners.

## Reusing X request context

The page script wraps `window.fetch` and records the ten most recent `x-client-transaction-id` values from X GraphQL requests. A bookmark request reuses the latest known ID when possible and generates a fallback value when none has been observed.

The request also reads the `ct0` cookie for the CSRF header and uses `credentials: 'include'`. These details are kept inside the page script instead of leaking into the React or storage layers.

## Bookmark response parsing

The bookmark endpoint returns nested timeline instructions. The parser does not assume one fixed wrapper. It searches recursively for an instruction list, then keeps entries whose IDs start with `tweet-`.

The parser normalizes the unstable response into the application's small capture type:

```ts
{
  tweetId,
  text,
  author: {name, username},
  avatarUrl,
  postedAt,
  media
}
```

The rest of the application does not need to know whether X returned a direct tweet result or a nested `tweet` result.

Media is normalized at the same boundary. Images keep their image URL. Videos and animated GIFs select the highest-bitrate MP4 variant and retain the original URL as a preview URL.

## Native bookmark actions

X is a dynamic application, so bookmark buttons can be inserted after the initial page load. `native-bookmark-observer.ts` handles this by:

1. scanning existing buttons;
2. observing added DOM nodes;
3. rescanning after a 250 ms debounce;
4. storing intercepted elements in a `WeakSet` to avoid duplicate listeners.

The listener reads the containing tweet article and captures the tweet ID, text, author, avatar, and timestamp. The content script writes this record locally as:

```ts
{
  source: 'manual',
  needsApiUpdate: true
}
```

That makes a newly bookmarked post appear locally without waiting for a complete sync. A later remote sync can replace the partial capture with authoritative X data while preserving local tags and folders.

## Remote deletion

The delete path is deliberately ordered:

```ts
await gateway.deleteRemote(tweetId, accountId)
await gateway.deleteLocal(tweetId, accountId)
```

The local row is removed only after X accepts the mutation or reports a 404. A failed remote mutation therefore does not make the local library silently disagree with X.

The operation validates tweet IDs before sending them and checks both the HTTP response and the mutation result returned by X.

## Failure boundary

Changes in X's cookies, GraphQL operation IDs, request headers, DOM selectors, or response shape surface as failures in this layer. The rest of the extension receives a normal error string through the runtime response and does not need to handle raw X response objects.