export interface BookmarkDeleteGateway {
  deleteRemote: (tweetId: string, accountId: string) => Promise<void>
  deleteLocal: (tweetId: string, accountId: string) => Promise<void>
  getAccountId: () => string
}

export function createBookmarkActions(gateway: BookmarkDeleteGateway) {
  async function deleteBookmark(tweetId: string) {
    const accountId = gateway.getAccountId()
    await gateway.deleteRemote(tweetId, accountId)
    await gateway.deleteLocal(tweetId, accountId)
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
