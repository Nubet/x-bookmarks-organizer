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

export type RuntimeMessage =
  | {type: 'BOOKMARKS_LIST'}
  | {type: 'FOLDER_LIST'}
  | {type: 'TAG_LIST'}
  | {type: 'SYNC_START'}

export type RuntimeResponse<T> =
  | {ok: true; data: T}
  | {ok: false; error: string}
