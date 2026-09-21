export interface BookmarkPreview {
  id: string
  tweetId: string
  text: string
  author: {
    name: string
    username: string
  }
  tags: string[]
  folderIds: string[]
  createdAt: number
  updatedAt: number
  source: 'x' | 'manual'
  needsApiUpdate: boolean
  searchTokens?: string[]
  avatarUrl?: string
  postedAt?: string
  postedAtTimestamp?: number
  media?: BookmarkMedia[]
}

export type AccountId = string

export interface BookmarkMedia {
  type: 'image' | 'video'
  url: string
  previewUrl?: string
}

export interface BookmarkCapture {
  tweetId: string
  text: string
  author: BookmarkPreview['author']
  avatarUrl?: string
  postedAt?: string
  media?: BookmarkMedia[]
}

export interface LocalBookmarkCapture extends BookmarkCapture {
  source: 'manual'
}

export interface RemoteBookmarkPage {
  bookmarks: BookmarkCapture[]
  nextCursor: string | null
}

export type SyncMode = 'full' | 'delta'

export interface SyncState {
  id: 'state'
  mode: SyncMode
  fullSyncCompleted: boolean
  processed: number
  lastSyncAt: number | null
  lastCursor: string | null
  lastError: string | null
}

export interface SyncPageResult {
  bookmarks: BookmarkPreview[]
  added: number
  enriched: number
  stop: boolean
}

export interface FolderPreview {
  id: string
  name: string
}

export interface FolderSummary extends FolderPreview {
  bookmarkCount: number
}

export interface LibrarySnapshot {
  bookmarks: BookmarkPreview[]
  folders: FolderPreview[]
  tags: string[]
}

export interface LibraryPage {
  bookmarks: BookmarkPreview[]
  nextOffset: number | null
  total: number
}

export type BookmarkMediaFilter = 'all' | 'image' | 'video' | 'link' | 'text'
export type BookmarkSortMode = 'sync-desc' | 'posted-desc'

export interface BookmarkSearchQuery {
  query: string
  authorUsername?: string
  folderId: string
  tag: string
  mediaType: BookmarkMediaFilter
  sortMode: BookmarkSortMode
}

export interface ExtensionSettings {
  key: 'default'
  pageIntegration: boolean
  autoSync: boolean
}

export type RuntimeMessage =
  | {type: 'LIBRARY_GET'; accountId: AccountId}
  | {type: 'LIBRARY_COUNT'; accountId: AccountId}
  | {type: 'LIBRARY_GET_PAGE'; accountId: AccountId; offset: number; limit: number; sortMode: BookmarkSortMode}
  | {type: 'LIBRARY_SEARCH_PAGE'; accountId: AccountId; offset: number; limit: number; search: BookmarkSearchQuery}
  | {type: 'FOLDERS_GET'; accountId: AccountId}
  | {type: 'FOLDER_CREATE'; accountId: AccountId; name: string}
  | {type: 'BOOKMARKS_ADD_TO_FOLDERS'; accountId: AccountId; bookmarkIds: string[]; folderIds: string[]}
  | {type: 'BOOKMARKS_REMOVE_FROM_FOLDERS'; accountId: AccountId; bookmarkIds: string[]; folderIds: string[]}
  | {type: 'BOOKMARK_DELETE'; accountId: AccountId; tweetId: string}
  | {type: 'BOOKMARKS_SYNC'; accountId: AccountId; bookmarks: BookmarkCapture[]; mode: SyncMode; nextCursor: string | null}
  | {type: 'BOOKMARK_CAPTURE_LOCAL'; accountId: AccountId; bookmark: LocalBookmarkCapture}
  | {type: 'BOOKMARK_REMOVE_LOCAL'; accountId: AccountId; tweetId: string}
  | {type: 'LIBRARY_CHANGED'; accountId: AccountId; added: number; enriched: number}
  | {type: 'SYNC_STATE_GET'; accountId: AccountId}
  | {type: 'SYNC_FINISH'; accountId: AccountId; mode: SyncMode; completed: boolean}
  | {type: 'SYNC_FAILED'; accountId: AccountId; error: string}
  | {type: 'SYNC_PROGRESS'; accountId: AccountId; mode: SyncMode; processed: number; added: number; enriched: number}
  | {type: 'SYNC_FINISHED'; accountId: AccountId; mode: SyncMode; processed: number}
  | {type: 'SETTINGS_GET'}
  | {type: 'SETTINGS_UPDATE'; settings: Partial<ExtensionSettings>}
  | {type: 'SETTINGS_CHANGED'; settings: ExtensionSettings}
  | {type: 'SYNC_START'}
  | {type: 'AUTO_SYNC_REQUEST'; accountId: AccountId}
  | {type: 'SYNC_RUN'; accountId?: AccountId}

export type RuntimeResponse<T> =
  | {ok: true; data: T}
  | {ok: false; error: string}
