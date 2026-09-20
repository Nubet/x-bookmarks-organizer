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
  media?: BookmarkMedia[]
}

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

export interface RemoteBookmarkPage {
  bookmarks: BookmarkCapture[]
  nextCursor: string | null
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
  | {type: 'LIBRARY_GET'}
  | {type: 'LIBRARY_GET_PAGE'; offset: number; limit: number}
  | {type: 'LIBRARY_SEARCH_PAGE'; offset: number; limit: number; search: BookmarkSearchQuery}
  | {type: 'FOLDERS_GET'}
  | {type: 'FOLDER_CREATE'; name: string}
  | {type: 'BOOKMARKS_ADD_TO_FOLDERS'; bookmarkIds: string[]; folderIds: string[]}
  | {type: 'BOOKMARKS_REMOVE_FROM_FOLDERS'; bookmarkIds: string[]; folderIds: string[]}
  | {type: 'BOOKMARK_SAVE'; bookmark: BookmarkCapture}
  | {type: 'BOOKMARK_DELETE'; tweetId: string}
  | {type: 'BOOKMARKS_SYNC'; bookmarks: BookmarkCapture[]}
  | {type: 'SETTINGS_GET'}
  | {type: 'SETTINGS_UPDATE'; settings: Partial<ExtensionSettings>}
  | {type: 'SYNC_START'}
  | {type: 'SYNC_RUN'}

export type RuntimeResponse<T> =
  | {ok: true; data: T}
  | {ok: false; error: string}
