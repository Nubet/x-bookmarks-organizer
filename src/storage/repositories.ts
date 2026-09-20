import {accountDatabases} from './account-database-manager'
import {database} from './database'
import type {
  BookmarkSearchQuery,
  BookmarkCapture,
  ExtensionSettings,
  LibrarySnapshot,
  FolderSummary,
} from '../shared/types'
import {addFolderIds, folderNameKey, normalizeFolderName, removeFolderIds} from '../domain/folders/folder-operations'
import {createSearchIndex, createSearchTokens, filterBookmarks, shouldUseTokenIndex, sortBookmarks, tokenizeSearchQuery} from '../domain/search/search-bookmarks'

const defaultSettings: ExtensionSettings = {
  key: 'default',
  pageIntegration: true,
  autoSync: false,
}

function getDatabase(accountId: string) {
  return accountDatabases.open(accountId)
}

export async function getLibrary(accountId: string): Promise<LibrarySnapshot> {
  const database = await getDatabase(accountId)
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

export async function getBookmarkPage(accountId: string, offset: number, limit: number) {
  const database = await getDatabase(accountId)
  const [bookmarks, total] = await Promise.all([
    database.bookmarks.orderBy('createdAt').reverse().offset(offset).limit(limit).toArray(),
    database.bookmarks.count(),
  ])

  const nextOffset = offset + bookmarks.length < total ? offset + bookmarks.length : null
  return {bookmarks, nextOffset, total}
}

export async function getFolderSummaries(accountId: string): Promise<FolderSummary[]> {
  const database = await getDatabase(accountId)
  const folders = await database.folders.orderBy('name').toArray()
  return Promise.all(folders.map(async (folder) => ({
    ...folder,
    bookmarkCount: await database.bookmarks.where('folderIds').equals(folder.id).count(),
  })))
}

export async function createFolder(accountId: string, name: string): Promise<FolderSummary> {
  const database = await getDatabase(accountId)
  const normalizedName = normalizeFolderName(name)
  if (!normalizedName) throw new Error('Folder name is required.')
  if (normalizedName.length > 80) throw new Error('Folder name must be 80 characters or fewer.')

  return database.transaction('rw', database.folders, database.bookmarks, async () => {
    const existing = await database.folders.toArray()
    if (existing.some((folder) => folderNameKey(folder.name) === folderNameKey(normalizedName))) {
      throw new Error('A folder with this name already exists.')
    }

    const folder = {id: crypto.randomUUID(), name: normalizedName}
    await database.folders.add(folder)
    return {...folder, bookmarkCount: 0}
  })
}

async function updateBookmarkFolders(
  database: Awaited<ReturnType<typeof getDatabase>>,
  bookmarkIds: string[],
  folderIds: string[],
  update: (currentIds: string[]) => string[]
) {
  if (bookmarkIds.length === 0 || folderIds.length === 0) return []

  return database.transaction('rw', database.bookmarks, database.folders, async () => {
    const folders = await database.folders.bulkGet(folderIds)
    if (folders.some((folder) => !folder)) throw new Error('One or more folders no longer exist.')

    const bookmarks = await database.bookmarks.bulkGet(bookmarkIds)
    const updated = bookmarks.flatMap((bookmark) => bookmark ? [{...bookmark, folderIds: update(bookmark.folderIds)}] : [])
    await database.bookmarks.bulkPut(updated)
    return updated
  })
}

export function addBookmarksToFolders(accountId: string, bookmarkIds: string[], folderIds: string[]) {
  return getDatabase(accountId).then((database) => updateBookmarkFolders(database, bookmarkIds, folderIds, (currentIds) => addFolderIds(currentIds, folderIds)))
}

export function removeBookmarksFromFolders(accountId: string, bookmarkIds: string[], folderIds: string[]) {
  return getDatabase(accountId).then((database) => updateBookmarkFolders(database, bookmarkIds, folderIds, (currentIds) => removeFolderIds(currentIds, folderIds)))
}

export async function searchBookmarkPage(accountId: string, search: BookmarkSearchQuery, offset: number, limit: number) {
  const database = await getDatabase(accountId)
  const queryTokens = tokenizeSearchQuery(search.query)
  const bookmarks = queryTokens.length > 0 && shouldUseTokenIndex(search.query, queryTokens)
    ? await database.bookmarks.where('searchTokens').anyOf(queryTokens).distinct().toArray()
    : await database.bookmarks.toArray()
  const matches = sortBookmarks(
    filterBookmarks(createSearchIndex(bookmarks), search.query, search.folderId, search.tag, search.mediaType, search.authorUsername),
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

export async function upsertRemoteBookmarks(accountId: string, captures: BookmarkCapture[]) {
  const database = await getDatabase(accountId)
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

export async function deleteBookmark(accountId: string, tweetId: string) {
  const database = await getDatabase(accountId)
  await database.bookmarks.delete(tweetId)
}
