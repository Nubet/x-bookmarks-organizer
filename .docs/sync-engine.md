# Sync Engine

Sync is the most coordinated part of the extension. It crosses the content script, the background runtime, the page bridge, and the account database. The important constraint is that an automatic sync must be cheap, cannot run twice at the same time, and must never write data to the wrong X account.

## Ownership split

The content script owns the page-side loop because it can communicate with the injected X page script. The background runtime owns when a run may start and routes each received page into storage.

```text
content script -> fetch one X page
content script -> BOOKMARKS_SYNC
background     -> upsertRemoteBookmarks(accountId, page, mode)
content script -> next cursor or SYNC_FINISH
```

The background does not fetch bookmark pages itself. It selects an X tab and sends `SYNC_RUN` to that tab:

```ts
response = await chrome.tabs.sendMessage(
  tab.id,
  {type: 'SYNC_RUN', accountId: expectedAccountId} satisfies RuntimeMessage
)
```

This keeps X-specific work in a context that has access to the active page session.

## Full and delta sync

The first completed run is a full sync. Later runs use delta mode:

```ts
const state = await getSyncState(accountId)
const mode = state.fullSyncCompleted ? 'delta' : 'full'
```

Delta mode compares captures by tweet ID, not by remote ordering. New records and records marked `needsApiUpdate` are written. If a non-empty page contains no records that need writing, the run stops early:

```ts
const existingRecords = await database.bookmarks.bulkGet(
  captures.map((capture) => capture.tweetId)
)
const capturesToWrite = selectSyncCaptures(captures, existingRecords, 'delta')

const stop = mode === 'delta'
  && captures.length > 0
  && capturesToWrite.length === 0
```

`bulkGet` receives tweet IDs in capture order, so each returned record corresponds to the capture with the same tweet ID. The array position is only used to align the lookup result; it is not a remote-page ordering assumption.

This is an optimization rather than a remote mirror. Sync upserts records returned by X but does not remove local records that are absent from the fetched pages. An explicit delete action is the path that removes a record locally.

## Cursor safety

The page loop has two guards:

```ts
for (let page = 0; page < 50; page += 1) {
  // fetch and persist the current page
  if (seenCursors.has(result.nextCursor)) break
  seenCursors.add(result.nextCursor)
  cursor = result.nextCursor
}
```

The 50-page limit bounds the cost of one run. The cursor set protects against a repeated cursor from creating an infinite loop.

If the loop exits because of one of those guards, `completed` stays false. `lastSyncAt` is still recorded because the attempt finished, but `fullSyncCompleted` is not set. The next run therefore remains a full sync.

## Account safety

The content script checks the account before and after every remote or storage boundary. It stores the account generation at the start of a run:

```ts
const syncAccountId = requireAccountId()
const syncGeneration = accountGeneration

const assertCurrentOperation = () => {
  if (readAccountId() !== syncAccountId || accountGeneration !== syncGeneration) {
    throw new Error('X account changed during sync. Run sync again.')
  }
}
```

When the `twid` cookie changes, the generation increments and the current view is reset. A stale run can fail, but it cannot continue writing under the new account.

## Avoiding duplicate work

There are several automatic entry points:

- entering the bookmark route;
- clicking a native bookmark button;
- the fifteen-minute alarm.

Native actions wait two seconds before requesting sync. This coalesces several quick clicks into one request. Automatic requests are also blocked for five seconds after a completed sync:

```ts
export function isQuickSyncThrottled(lastSyncAt: number | null, now = Date.now()) {
  return lastSyncAt !== null && now - lastSyncAt < 5_000
}
```

Finally, the background keeps one shared promise:

```ts
if (syncFlight) return syncFlight
syncFlight = runSync(tabId, expectedAccountId).finally(() => {
  syncFlight = null
})
```

The debounce reduces event noise, the throttle reduces repeated automatic starts, and the single-flight guard prevents concurrent page traversals. They solve different races and are intentionally separate. The five-second throttle starts after `SYNC_FINISH`, including an attempt that ended incomplete; a failed run that never reaches `SYNC_FINISH` does not update `lastSyncAt`.

Manual sync uses `SYNC_START` and is not blocked by the quick-sync throttle. It still shares the single-flight guard.

## Retry behavior

The background allows two retries after the initial connection attempt, with delays of 500 ms and 1,000 ms. The page bridge also allows two retries for bookmark fetches and transaction-ID reads, using its default 250 ms base delay and therefore 250 ms and 500 ms delays. Retryable page errors are timeouts, network failures, HTTP 429, and HTTP 5xx responses.

The retry boundary is deliberately narrow. A malformed response, an invalid tweet ID, or an X application error is not treated as a transient connection problem.
