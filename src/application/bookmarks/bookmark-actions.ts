export interface BookmarkDeleteGateway {
  deleteRemote: (tweetId: string) => Promise<void>
  deleteLocal: (tweetId: string) => Promise<void>
}

export function createBookmarkActions(gateway: BookmarkDeleteGateway) {
  async function deleteBookmark(tweetId: string) {
    await gateway.deleteRemote(tweetId)
    await gateway.deleteLocal(tweetId)
  }

  async function deleteBookmarks(
    tweetIds: string[],
    onProgress?: (removed: number) => void
  ) {
    let removed = 0
    for (const tweetId of tweetIds) {
      await deleteBookmark(tweetId)
      removed += 1
      onProgress?.(removed)
    }
    return removed
  }

  return {deleteBookmark, deleteBookmarks}
}
