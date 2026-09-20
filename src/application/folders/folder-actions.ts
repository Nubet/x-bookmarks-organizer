import type {BookmarkPreview, FolderSummary} from '../../shared/types'

export interface FolderGateway {
  getFolders: () => Promise<FolderSummary[]>
  createFolder: (name: string) => Promise<FolderSummary>
  addBookmarksToFolders: (bookmarkIds: string[], folderIds: string[]) => Promise<BookmarkPreview[]>
  removeBookmarksFromFolders: (bookmarkIds: string[], folderIds: string[]) => Promise<BookmarkPreview[]>
}

export function createFolderActions(gateway: FolderGateway) {
  return {
    getFolders: gateway.getFolders,
    createFolder: gateway.createFolder,
    addBookmarksToFolders: gateway.addBookmarksToFolders,
    removeBookmarksFromFolders: gateway.removeBookmarksFromFolders,
  }
}
