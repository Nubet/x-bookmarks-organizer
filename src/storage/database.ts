import Dexie, {type Table} from 'dexie'
import type {
  BookmarkPreview,
  ExtensionSettings,
  FolderPreview,
} from '../shared/types'
import {createSearchTokens} from '../domain/search/search-bookmarks'

export const SETTINGS_DATABASE_NAME = 'x-bookmarks-organizer'
export const ACCOUNT_DATABASE_PREFIX = 'x-bookmarks-organizer-account-'

export interface TagRecord {
  id: string
  name: string
}

export class BookmarkDatabase extends Dexie {
  bookmarks!: Table<BookmarkPreview, string>
  folders!: Table<FolderPreview, string>
  tags!: Table<TagRecord, string>
  settings!: Table<ExtensionSettings, string>

  constructor(name = SETTINGS_DATABASE_NAME) {
    super(name)

    this.version(1).stores({
      bookmarks: 'id,tweetId,updatedAt',
      folders: 'id,name',
      tags: 'id,name',
      settings: 'key',
    })

    this.version(2).stores({
      bookmarks: 'id,tweetId,createdAt,updatedAt',
      folders: 'id,name',
      tags: 'id,name',
      settings: 'key',
    })

    this.version(3).stores({
      bookmarks: 'id,tweetId,createdAt,updatedAt,postedAt,*searchTokens',
      folders: 'id,name',
      tags: 'id,name',
      settings: 'key',
    }).upgrade(async (transaction) => {
      await transaction.table('bookmarks').toCollection().modify((bookmark) => {
        bookmark.searchTokens = createSearchTokens(bookmark)
        })
      })

    this.version(4).stores({
      bookmarks: 'id,tweetId,createdAt,updatedAt,postedAt,*searchTokens,*folderIds',
      folders: 'id,name',
      tags: 'id,name',
      settings: 'key',
    })
  }
}

export const database = new BookmarkDatabase()

export function accountDatabaseName(accountId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(accountId)) throw new Error('Invalid X account ID')
  return `${ACCOUNT_DATABASE_PREFIX}${accountId}`
}

export function createAccountDatabase(accountId: string) {
  return new BookmarkDatabase(accountDatabaseName(accountId))
}
