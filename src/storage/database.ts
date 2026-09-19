import Dexie, {type Table} from 'dexie'
import type {
  BookmarkPreview,
  ExtensionSettings,
  FolderPreview,
} from '../shared/types'

export interface TagRecord {
  id: string
  name: string
}

export class BookmarkDatabase extends Dexie {
  bookmarks!: Table<BookmarkPreview, string>
  folders!: Table<FolderPreview, string>
  tags!: Table<TagRecord, string>
  settings!: Table<ExtensionSettings, string>

  constructor() {
    super('x-bookmarks-organizer')

    this.version(1).stores({
      bookmarks: 'id,tweetId,updatedAt',
      folders: 'id,name',
      tags: 'id,name',
      settings: 'key',
    })
  }
}

export const database = new BookmarkDatabase()
