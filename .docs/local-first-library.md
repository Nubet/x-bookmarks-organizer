# Local-First Library

The library is designed to feel like a local application even though its source data lives on X. After synchronization, searching, sorting, folder operations, and most rendering do not require another network request.

## Account-scoped IndexedDB

Settings live in the shared database. Bookmark records and sync state live in a database named from the X account ID:

```ts
return `${ACCOUNT_DATABASE_PREFIX}${accountId}`
```

This is the primary data-isolation mechanism. A logout or account switch does not require deleting data; the next account simply opens a different database.

`AccountDatabaseManager` caches the promise for each open database. Concurrent reads for the same account therefore share initialization and connection state.

## Preserving local organization

Remote upserts deliberately preserve local fields:

```ts
tags: existing?.tags ?? [],
folderIds: existing?.folderIds ?? [],
createdAt: existing?.createdAt ?? now,
```

The remote copy can update text, author, media, and timestamps without destroying folders or tags. This is the key distinction between the remote bookmark capture and the local library record.

## Persistent search index

Each bookmark stores unique normalized `searchTokens` built from its text, author name, username, and tags. Dexie indexes the array as a multi-entry index:

```ts
bookmarks: 'id,tweetId,createdAt,updatedAt,postedAt,postedAtTimestamp,*searchTokens,*folderIds'
```

For multi-token, `@username`, and `#tag` queries, the repository first asks Dexie for candidates:

```ts
database.bookmarks
  .where('searchTokens')
  .anyOf(queryTokens)
  .distinct()
  .toArray()
```

The normal matcher still runs afterward. The index reduces the number of records inspected; it does not define the final result. This matters because exact username matching, substring matching, folder filters, and media filters cannot all be represented by the token index.

Single-word plain queries can use a full table scan so substring behavior remains correct. For example, `type` must match `typescript`, even though `type` is not a complete token in that word.

## Paging and rendering

The background repository returns library pages of 100 records. The view initially renders at most 100 records and loads more through an intersection sentinel as the user scrolls.

There are two limits:

- the database page limit controls how much is transferred from the background to the content script;
- the render limit controls how many already-loaded records are rendered by React.

This prevents a large library from becoming one large initial React render while still allowing the user to continue through the complete library.

Full-library search is also paginated. Author mode is the exception: it loads all matching pages because author groups cannot be complete, and would not make sense until all records are available.

## Stale-result protection

Every library or search request captures the account ID and a request counter. A response is ignored when either no longer matches:

```ts
if (requestId !== searchRequest || readAccountId() !== accountId) return
```

This handles two common browser races:

- a slow search returns after the user submits a newer search;
- a database request returns after the user changes X accounts.

The same account check is used when receiving `LIBRARY_CHANGED` broadcasts from other tabs.
