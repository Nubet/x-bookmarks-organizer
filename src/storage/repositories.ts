import {database} from './database'
import type {
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
