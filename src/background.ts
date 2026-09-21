import type {RuntimeMessage, RuntimeResponse, SyncPageResult} from './shared/types'
import {retryAsync} from './shared/retry'
import {
  getLibrary,
  getLibraryCount,
  getBookmarkPage,
  searchBookmarkPage,
  getSettings,
  updateSettings,
  upsertRemoteBookmarks,
  upsertLocalBookmark,
  getSyncState,
  updateSyncState,
  deleteBookmark,
  getFolderSummaries,
  createFolder,
  addBookmarksToFolders,
  removeBookmarksFromFolders,
} from './storage/repositories'

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    _sender,
    sendResponse: (response: RuntimeResponse<unknown>) => void
  ) => {
    void handleMessage(message).then(sendResponse)
    return true
  }
)

async function handleMessage(
  message: RuntimeMessage
): Promise<RuntimeResponse<unknown>> {
  try {
    switch (message.type) {
      case 'LIBRARY_GET':
        return {ok: true, data: await getLibrary(message.accountId)}
      case 'LIBRARY_COUNT':
        return {ok: true, data: await getLibraryCount(message.accountId)}
      case 'LIBRARY_GET_PAGE':
        return {ok: true, data: await getBookmarkPage(message.accountId, message.offset, message.limit, message.sortMode)}
      case 'LIBRARY_SEARCH_PAGE':
        return {ok: true, data: await searchBookmarkPage(message.accountId, message.search, message.offset, message.limit)}
      case 'FOLDERS_GET':
        return {ok: true, data: await getFolderSummaries(message.accountId)}
      case 'FOLDER_CREATE':
        return {ok: true, data: await createFolder(message.accountId, message.name)}
      case 'BOOKMARKS_ADD_TO_FOLDERS':
        return {ok: true, data: await addBookmarksToFolders(message.accountId, message.bookmarkIds, message.folderIds)}
      case 'BOOKMARKS_REMOVE_FROM_FOLDERS':
        return {ok: true, data: await removeBookmarksFromFolders(message.accountId, message.bookmarkIds, message.folderIds)}
      case 'BOOKMARK_DELETE':
        return {ok: true, data: await deleteBookmark(message.accountId, message.tweetId)}
      case 'BOOKMARKS_SYNC': {
        const result = await upsertRemoteBookmarks(message.accountId, message.bookmarks, message.mode)
        const state = await getSyncState(message.accountId)
        await updateSyncState(message.accountId, {
          mode: message.mode,
          processed: state.processed + message.bookmarks.length,
          lastCursor: result.stop ? null : message.nextCursor,
          lastError: null,
        })
        broadcastLibraryChanged(message.accountId, result.added, result.enriched)
        broadcastSyncProgress(message.accountId, message.mode, state.processed + message.bookmarks.length, result.added, result.enriched)
        return {ok: true, data: result satisfies SyncPageResult}
      }
      case 'BOOKMARK_CAPTURE_LOCAL': {
        const result = await upsertLocalBookmark(message.accountId, message.bookmark)
        broadcastLibraryChanged(message.accountId, result.added, 0)
        return {ok: true, data: result.bookmark}
      }
      case 'BOOKMARK_REMOVE_LOCAL':
        await deleteBookmark(message.accountId, message.tweetId)
        broadcastLibraryChanged(message.accountId, 0, 0)
        return {ok: true, data: null}
      case 'LIBRARY_CHANGED':
        return {ok: true, data: null}
      case 'SYNC_STATE_GET': {
        const state = await getSyncState(message.accountId)
        const mode = state.fullSyncCompleted ? 'delta' : 'full'
        return {ok: true, data: await updateSyncState(message.accountId, {
          mode,
          processed: 0,
          lastCursor: null,
          lastError: null,
        })}
      }
      case 'SYNC_FINISH': {
        const state = await getSyncState(message.accountId)
        const updated = await updateSyncState(message.accountId, {
          mode: message.mode,
          fullSyncCompleted: message.mode === 'full' && message.completed ? true : state.fullSyncCompleted,
          lastSyncAt: message.completed ? Date.now() : state.lastSyncAt,
          lastCursor: null,
          lastError: null,
        })
        broadcastSyncFinished(message.accountId, message.mode, updated.processed)
        return {ok: true, data: updated}
      }
      case 'SYNC_FAILED': {
        const updated = await updateSyncState(message.accountId, {lastError: message.error})
        return {ok: true, data: updated}
      }
      case 'SYNC_PROGRESS':
        return {ok: true, data: null}
      case 'SYNC_FINISHED':
        return {ok: true, data: null}
      case 'SETTINGS_GET':
        return {ok: true, data: await getSettings()}
      case 'SETTINGS_UPDATE':
        return {ok: true, data: await updateSettings(message.settings)}
      case 'SYNC_START':
        return {ok: true, data: await startSync()}
      case 'SYNC_RUN':
        return {ok: false, error: 'SYNC_RUN is only valid in a content script'}
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Storage operation failed',
    }
  }
}

let syncFlight: Promise<unknown> | null = null

async function startSync() {
  if (syncFlight) return syncFlight

  syncFlight = runSync().finally(() => {
    syncFlight = null
  })
  return syncFlight
}

async function runSync() {
  return retryAsync(async () => {
    // Let the content-script handshake identify the X tab. Reading tab.url can be
    // restricted after a clean install when the manifest has no tabs permission.
    const tabs = await chrome.tabs.query({active: true, lastFocusedWindow: true})
    const tab = tabs.find((candidate) => candidate.id !== undefined)
    if (!tab?.id) throw new Error('Open or reload an X tab before starting sync')

    let response: RuntimeResponse<unknown>
    try {
      response = await chrome.tabs.sendMessage(
        tab.id,
        {type: 'SYNC_RUN'} satisfies RuntimeMessage
      ) as RuntimeResponse<unknown>
    } catch (error) {
      if (/Receiving end does not exist|Could not establish connection/i.test(error instanceof Error ? error.message : String(error))) {
        throw new Error('Reload the X tab before starting sync')
      }
      throw error
    }
    if (response?.ok) return response.data
    throw new Error(response?.error ?? 'Sync failed in the X tab')
  }, {
    retries: 2,
    baseDelayMs: 500,
    shouldRetry: (error) => /Receiving end does not exist|Could not establish connection|Open or reload/i.test(error instanceof Error ? error.message : String(error)),
  })
}

function broadcastLibraryChanged(accountId: string, added: number, enriched: number) {
  chrome.runtime.sendMessage({type: 'LIBRARY_CHANGED', accountId, added, enriched}, () => {
    void chrome.runtime.lastError
  })
}

function broadcastSyncProgress(accountId: string, mode: 'full' | 'delta', processed: number, added: number, enriched: number) {
  chrome.runtime.sendMessage({type: 'SYNC_PROGRESS', accountId, mode, processed, added, enriched}, () => {
    void chrome.runtime.lastError
  })
}

function broadcastSyncFinished(accountId: string, mode: 'full' | 'delta', processed: number) {
  chrome.runtime.sendMessage({type: 'SYNC_FINISHED', accountId, mode, processed}, () => {
    void chrome.runtime.lastError
  })
}
