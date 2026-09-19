# Search Architecture

> **Scope:** Domain search & Dexie storage indexing
> 
This document describes the current bookmark search implementation.

The search has two layers:

1. An in-memory search index used by the React view.
2. A persistent Dexie multi-entry index used by the background search.

The two layers use the same matching rules, but they solve different problems.

## Goals

The search must:

- work on bookmark text;
- work on author name and username;
- work on tags;
- support `@username` queries;
- support `#tag` queries;
- support folder and media filters;
- support sorting;
- avoid loading the whole library into the rendered page;
- support a large local bookmark library.

## Main Files

| File | Responsibility |
| --- | --- |
| `src/domain/search/search-bookmarks.ts` | Normalization, tokenization, matching, sorting, media counts |
| `src/content/bookmarks-view.tsx` | Search input, local filtering, search result rendering, pagination state |
| `src/storage/database.ts` | Dexie schema and the persistent `searchTokens` index |
| `src/storage/repositories.ts` | Database reads, candidate lookup, filtering, sorting, pagination |
| `src/background.ts` | Runtime message routing between the content script and storage |
| `src/shared/types.ts` | Search query, library page, and runtime message types |

## High-Level Data Flow

### Initial view

The content script asks the background service worker for the first page:

```text
BookmarksView
  -> LIBRARY_GET_PAGE { offset: 0, limit: 100 }
  -> background.ts
  -> getBookmarkPage()
  -> Dexie bookmarks table
  -> first 100 bookmarks
  -> BookmarksView
```

The view stores the page in its local snapshot. It does not load the complete
library into React state at startup.

### Load more

When the user loads more records, the view sends the next offset:

```text
current nextOffset
  -> LIBRARY_GET_PAGE { offset, limit: 100 }
  -> Dexie
  -> next page
  -> append page to the current snapshot
```

The storage layer returns:

```ts
interface LibraryPage {
  bookmarks: BookmarkPreview[]
  nextOffset: number | null
  total: number
}
```

`nextOffset: null` means there are no more records.

### Full search

The user can press Enter in the search input. This sends a
`LIBRARY_SEARCH_PAGE` message to the background service worker:

```text
search input + Enter
  -> BookmarkSearchQuery
  -> LIBRARY_SEARCH_PAGE
  -> searchBookmarkPage()
  -> optional Dexie candidate lookup
  -> exact application filters
  -> sort
  -> slice one page
  -> return page and total match count
```

The full search runs outside the React render path. This matters when the
library is large.

## Query Model

The complete search query is:

```ts
interface BookmarkSearchQuery {
  query: string
  folderId: string
  tag: string
  mediaType: 'all' | 'image' | 'video' | 'link' | 'text'
  sortMode: 'sync-desc' | 'posted-desc'
}
```

The query contains both the text search and the other filters. The storage
layer receives one object, so the filtering rules are the same for every
search request.

## Normalization

All searchable values are normalized before matching.

Current normalization:

1. Unicode is converted with `NFKD`.
2. Diacritic marks are removed.
3. Leading and trailing whitespace is removed.
4. Repeated whitespace becomes one space.
5. Text is converted to lowercase.

Example:

```text
"  Text  " -> "text"
```

The same rule applies to accented input. The implementation removes combining
marks but keeps the original base characters. Case and accents do not prevent
a match.

Normalization is implemented in `normalize()` inside
`src/domain/search/search-bookmarks.ts`.

## In-Memory Search Index

`createSearchIndex()` converts each bookmark into a searchable document:

```ts
interface SearchDocument {
  bookmark: BookmarkPreview
  text: string
  author: string
  username: string
  tags: string[]
}
```

The index is created from the bookmarks currently loaded in the view:

```text
loaded bookmarks
  -> createSearchIndex()
  -> normalized search documents
  -> filterBookmarks()
  -> sortBookmarks()
  -> render
```

This index is temporary. It is recreated when the loaded bookmark snapshot
changes. It is not stored in IndexedDB.

### Why use an in-memory index?

The view performs local filtering on every query change. Keeping normalized
values avoids repeating normalization logic for every field and makes the
matching code explicit.

The view also uses `useDeferredValue(query)`. This allows React to delay the
expensive filtering work while the user is typing.

## Persistent Dexie Search Index

Bookmark records contain an optional `searchTokens` field:

```ts
searchTokens?: string[]
```

Dexie defines it as a multi-entry index:

```ts
bookmarks: 'id,tweetId,createdAt,updatedAt,postedAt,*searchTokens'
```

The `*` is important. It tells Dexie that every item in the array is an
indexable value.

Example record:

```ts
{
  id: 'tweet-123',
  text: 'Useful TypeScript patterns',
  author: {
    name: 'Jane Doe',
    username: 'jane'
  },
  tags: ['typescript', 'frontend'],
  searchTokens: ['useful', 'typescript', 'patterns', 'jane', 'frontend']
}
```

The tokens are generated from:

- bookmark text;
- author display name;
- author username;
- bookmark tags.

Tokens are lowercase, unique, and split on non-alphanumeric characters.

The persistent index is updated when bookmarks are written through:

- `upsertCapturedBookmark()`;
- `upsertRemoteBookmarks()`.

Existing databases receive the field during the Dexie version 3 upgrade.

## When the Dexie Index Is Used

`shouldUseTokenIndex()` enables the persistent token lookup when:

- the query has more than one token;
- the normalized query starts with `@`;
- the normalized query starts with `#`.

Examples:

```text
typescript patterns  -> token index
@jane                -> token index
#frontend            -> token index
typescript           -> full table scan
```

The single-word scan is intentional. The normal single-word matcher supports
substring matching. A token index would find `type` as a token, but it would
not find `type` inside `typescript`.

## Candidate Lookup

For an indexed query, the repository first asks Dexie for candidate records:

```ts
database.bookmarks
  .where('searchTokens')
  .anyOf(queryTokens)
  .distinct()
  .toArray()
```

`anyOf()` returns records containing at least one query token. This is only a
candidate set. It is not the final result.

The candidate set is then passed through the normal application matcher.
This second step is required because:

- `@username` needs exact username matching;
- `#tag` needs tag-specific matching;
- folder filters are not part of `searchTokens`;
- media filters are not part of `searchTokens`;
- multi-word text queries need their normal text matching rule.

The important rule is:

```text
Dexie index = reduce the number of records to inspect
application matcher = decide the final result
```

The Dexie index is an optimization, not a replacement for the domain search
logic.

## Matching Rules

### Plain query

A plain query matches when the normalized query appears in at least one of:

- bookmark text;
- author display name;
- author username;
- any normalized tag.

The current plain query uses substring matching.

Examples:

```text
design  -> matches "design systems"
jan     -> matches username "jane"
front   -> matches tag "frontend"
```

### `@username`

A query in the form `@username` matches the normalized username exactly.

```text
@jane -> username must equal "jane"
```

It does not perform a substring match against the username.

### `#tag`

A query in the form `#tag` matches when:

- a bookmark tag equals the requested tag after removing the leading `#`;
- or bookmark text contains `#tag`.

### Empty query

An empty query matches every loaded candidate. Folder, tag, and media filters
still apply.

## Filter Order

The domain matcher applies these checks to each search document:

1. Text, username, or tag query match.
2. Media type match.
3. Folder match.
4. Sidebar tag match.

All checks must pass.

In logical form:

```text
result = queryMatch
      AND mediaMatch
      AND folderMatch
      AND sidebarTagMatch
```

The result is then sorted. Pagination is applied after sorting in the
background search path.

## Media Filters

Media matching supports:

- `all`;
- `image`;
- `video`;
- `link`;
- `text`.

The `link` filter checks bookmark text with a URL pattern that accepts
`http://`, `https://`, and `www.` URLs. This also covers X short links such as
`https://t.co/...`.

The `text` filter means the bookmark has no media entries. A text-only
bookmark may still contain a link. The link filter and text filter are not
mutually exclusive by content; they represent different properties.

## Media Counters

The counters shown above the library are derived from the current search
matches:

```text
current query + folder + sidebar tag
  -> filter with media type = all
  -> countMedia()
  -> All / Images / Videos / Links / Text only
```

The active media filter is deliberately excluded when calculating the
counters. This keeps the counters useful as facets.

For example, when the search matches 10 bookmarks and 3 contain images:

```text
All media: 10
Images: 3
```

When the user selects `Images`, the image count remains 3 and the other
counters do not become zero.

The counters currently describe the loaded result set in the content view.
After a full search, the loaded result set is the current search page plus any
pages loaded with `Load more`.

## Local Search Versus Full Search

There are two user-visible modes.

### Local typing search

While the user types, the view filters the bookmarks currently loaded in its
snapshot.

Advantages:

- immediate feedback;
- no runtime message for every keystroke;
- no background database scan for every character.

Limit:

- if only the first page is loaded, local typing search only sees that page.

### Full search after Enter

Pressing Enter sends the complete query to the background service worker.
The repository can inspect the full Dexie table and return a paginated result.

Advantages:

- searches records that are not currently loaded in the view;
- returns a `total` match count;
- keeps the large-library database work outside the React render path.

Limit:

- the current implementation computes matches before slicing the requested
  page, so a very large query still has to inspect all matching candidates;
- plain single-token queries intentionally use a full table scan to preserve
  substring behavior.

## Pagination

Normal library pagination uses Dexie's database order:

```ts
database.bookmarks
  .orderBy('createdAt')
  .reverse()
  .offset(offset)
  .limit(limit)
```

Full search pagination works differently:

1. Load either token-index candidates or all bookmarks.
2. Apply the domain filters.
3. Sort the complete matching array.
4. Slice `offset` to `offset + limit`.

This guarantees that pages follow the selected sort order.

The page size is currently 100 records.

## Sorting

The search supports:

- `posted-desc`: newest original post date first;
- `sync-desc`: newest local update first.

Missing dates are treated as zero during sorting and therefore go after
records with valid dates.

Sorting is centralized in `sortBookmarks()` so local and background search use
the same rule.

## Database Migrations

Dexie uses versioned schemas.

Version 3 added:

- `postedAt` to the bookmark schema;
- `*searchTokens` as a multi-entry index;
- an upgrade callback that creates tokens for existing bookmarks.

The upgrade callback is necessary because old records do not have
`searchTokens`. New writes create the field directly.

## Performance Model

The current design avoids two common costs:

1. It does not render the whole library at startup.
2. It does not normalize every bookmark field from scratch on every render.

For indexed queries, Dexie reduces the candidate set before domain matching.
For the local view, the index is built once per loaded snapshot and reused by
the memoized filtering calculation.

The current render path also limits the number of displayed bookmark cards.
Filtering still produces the complete loaded result array, but rendering is
bounded separately.

## Correctness Rules

Any future search optimization must preserve these rules:

- `@username` remains an exact username query;
- `#tag` checks both tags and inline hashtag text;
- plain single words keep substring matching;
- folder and sidebar tag filters still apply after candidate lookup;
- media filters still apply after candidate lookup;
- sorting happens before full-search pagination;
- writes always update `searchTokens`.

Changing the candidate lookup without running `filterBookmarks()` again can
create false positives or false negatives.