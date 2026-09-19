import {database} from './database'
import type {
  BookmarkSearchQuery,
  BookmarkCapture,
  ExtensionSettings,
  LibrarySnapshot,
} from '../shared/types'
import {createSearchIndex, createSearchTokens, filterBookmarks, shouldUseTokenIndex, sortBookmarks, tokenizeSearchQuery} from '../domain/search/search-bookmarks'

const defaultSettings: ExtensionSettings = {
  key: 'default',
  pageIntegration: true,
  autoSync: false,
}

export async function getLibrary(): Promise<LibrarySnapshot> {
  const [bookmarks, folders, tagRecords] = await Promise.all([
    database.bookmarks.orderBy('createdAt').reverse().toArray(),
    database.folders.orderBy('name').toArray(),
    database.tags.orderBy('name').toArray(),
  ])

  return {
    bookmarks,
    folders,
    tags: tagRecords.map((tag) => tag.name),
  }
}

export async function getBookmarkPage(offset: number, limit: number) {
  const [bookmarks, total] = await Promise.all([
    database.bookmarks.orderBy('createdAt').reverse().offset(offset).limit(limit).toArray(),
    database.bookmarks.count(),
  ])

  const nextOffset = offset + bookmarks.length < total ? offset + bookmarks.length : null
  return {bookmarks, nextOffset, total}
}

export async function searchBookmarkPage(search: BookmarkSearchQuery, offset: number, limit: number) {
  const queryTokens = tokenizeSearchQuery(search.query)
  const bookmarks = queryTokens.length > 0 && shouldUseTokenIndex(search.query, queryTokens)
    ? await database.bookmarks.where('searchTokens').anyOf(queryTokens).distinct().toArray()
    : await database.bookmarks.toArray()
  const matches = sortBookmarks(
    filterBookmarks(createSearchIndex(bookmarks), search.query, search.folderId, search.tag, search.mediaType),
    search.sortMode
  )
  const page = matches.slice(offset, offset + limit)
  const nextOffset = offset + page.length < matches.length ? offset + page.length : null
  return {bookmarks: page, nextOffset, total: matches.length}
}

export async function getSettings(): Promise<ExtensionSettings> {
  const settings = await database.settings.get('default')

  if (settings) return settings

  await database.settings.put(defaultSettings)
  return defaultSettings
}

export async function updateSettings(
  changes: Partial<ExtensionSettings>
): Promise<ExtensionSettings> {
  const settings: ExtensionSettings = {
    ...(await getSettings()),
    ...changes,
    key: 'default',
  }
  await database.settings.put(settings)
  return settings
}

export async function upsertCapturedBookmark(
  capture: BookmarkCapture
) {
  const now = Date.now()
  const existing = await database.bookmarks.get(capture.tweetId)
  const bookmark = {
    id: capture.tweetId,
    tweetId: capture.tweetId,
    text: capture.text,
    author: capture.author,
    avatarUrl: capture.avatarUrl ?? existing?.avatarUrl,
    postedAt: capture.postedAt ?? existing?.postedAt,
    media: capture.media ?? existing?.media,
    tags: existing?.tags ?? [],
    folderIds: existing?.folderIds ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    source: existing?.source ?? 'x',
    needsApiUpdate: true,
    searchTokens: createSearchTokens({text: capture.text, author: capture.author, tags: existing?.tags ?? []}),
  } as const

  await database.transaction('rw', database.bookmarks, database.tags, async () => {
    await database.bookmarks.put(bookmark)

    await database.tags.bulkPut(bookmark.tags.map((tag) => ({id: tag, name: tag})))
  })

  return bookmark
}

export async function upsertRemoteBookmarks(captures: BookmarkCapture[]) {
  const now = Date.now()
  const bookmarks = await database.transaction(
    'rw',
    database.bookmarks,
    database.tags,
    async () => {
      const existingRecords = await database.bookmarks.bulkGet(captures.map(c => c.tweetId))
      const result = []
      const tagsToPut = new Set<string>()

      for (let i = 0; i < captures.length; i++) {
        const capture = captures[i]
        const existing = existingRecords[i]
        const bookmark = {
          id: capture.tweetId,
          tweetId: capture.tweetId,
          text: capture.text,
          author: capture.author,
          avatarUrl: capture.avatarUrl ?? existing?.avatarUrl,
          postedAt: capture.postedAt ?? existing?.postedAt,
          media: capture.media ?? existing?.media,
          tags: existing?.tags ?? [],
          folderIds: existing?.folderIds ?? [],
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          source: 'x',
          needsApiUpdate: false,
          searchTokens: createSearchTokens({text: capture.text, author: capture.author, tags: existing?.tags ?? []}),
        } as const

        for (const tag of bookmark.tags) {
          tagsToPut.add(tag)
        }
        result.push(bookmark)
      }

      await database.bookmarks.bulkPut(result)
      const uniqueTags = Array.from(tagsToPut).map(tag => ({id: tag, name: tag}))
      if (uniqueTags.length > 0) {
        await database.tags.bulkPut(uniqueTags)
      }

      return result
    }
  )

  return bookmarks
}

export async function deleteBookmark(tweetId: string) {
  await database.bookmarks.delete(tweetId)
}
