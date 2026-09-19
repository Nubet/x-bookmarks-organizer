import type {
  BookmarkPreview,
  FolderPreview,
  RuntimeMessage,
  RuntimeResponse,
} from './shared/types'

const folders: FolderPreview[] = [{id: 'folder-reading', name: 'Reading'}]

const bookmarks: BookmarkPreview[] = [
  {
    id: 'bookmark-1',
    tweetId: 'demo-1',
    text: 'A local-first library makes saved posts useful long after the timeline moves on.',
    author: {name: 'Demo account', username: 'demo'},
    tags: ['product', 'offline'],
    folderIds: ['folder-reading'],
    createdAt: Date.now(),
  },
]

const tags = [...new Set(bookmarks.flatMap((bookmark) => bookmark.tags))]

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    _sender,
    sendResponse: (response: RuntimeResponse<unknown>) => void
  ) => {
    switch (message.type) {
      case 'BOOKMARKS_LIST':
        sendResponse({ok: true, data: bookmarks})
        break
      case 'FOLDER_LIST':
        sendResponse({ok: true, data: folders})
        break
      case 'TAG_LIST':
        sendResponse({ok: true, data: tags})
        break
      case 'SYNC_START':
        sendResponse({ok: true, data: {status: 'not-implemented'}})
        break
      default:
        sendResponse({ok: false, error: 'Unsupported runtime message'})
    }

    return true
  }
)
