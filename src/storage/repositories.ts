import {database} from './database'
import type {
  BookmarkCapture,
  ExtensionSettings,
  LibrarySnapshot,
} from '../shared/types'

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
    tags: existing?.tags ?? [],
    folderIds: existing?.folderIds ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    source: existing?.source ?? 'x',
    needsApiUpdate: true,
  } as const

  await database.transaction('rw', database.bookmarks, database.tags, async () => {
    await database.bookmarks.put(bookmark)

    for (const tag of bookmark.tags) {
      await database.tags.put({id: tag, name: tag})
    }
  })

  return bookmark
}
