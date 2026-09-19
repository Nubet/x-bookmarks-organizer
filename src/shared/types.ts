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
}

export interface BookmarkCapture {
  tweetId: string
  text: string
  author: BookmarkPreview['author']
}

export interface RemoteBookmarkPage {
  bookmarks: BookmarkCapture[]
  nextCursor: string | null
}

export interface FolderPreview {
  id: string
  name: string
}

export interface LibrarySnapshot {
  bookmarks: BookmarkPreview[]
  folders: FolderPreview[]
  tags: string[]
}

export interface ExtensionSettings {
  key: 'default'
  pageIntegration: boolean
  autoSync: boolean
}

export type RuntimeMessage =
  | {type: 'LIBRARY_GET'}
  | {type: 'BOOKMARK_SAVE'; bookmark: BookmarkCapture}
  | {type: 'BOOKMARKS_SYNC'; bookmarks: BookmarkCapture[]}
  | {type: 'SETTINGS_GET'}
  | {type: 'SETTINGS_UPDATE'; settings: Partial<ExtensionSettings>}
  | {type: 'SYNC_START'}
  | {type: 'SYNC_RUN'}

export type RuntimeResponse<T> =
  | {ok: true; data: T}
  | {ok: false; error: string}
