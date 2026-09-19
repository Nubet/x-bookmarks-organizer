import {bench, describe} from 'vitest'
import type {BookmarkPreview} from '../src/shared/types'
import {createSearchIndex, filterBookmarks} from '../src/domain/search/search-bookmarks'

function createBenchmarkBookmarks(count: number): BookmarkPreview[] {
  return Array.from({length: count}, (_, index) => ({
    id: String(index),
    tweetId: String(index),
    text: index % 10 === 0
      ? `Project ${index} contains a searchable engineering note`
      : `Project ${index} contains an unrelated note`,
    author: {name: `Author ${index}`, username: `author_${index}`},
    tags: index % 2 === 0 ? ['engineering'] : [],
    folderIds: [],
    createdAt: index,
    updatedAt: index,
    source: 'x' as const,
    needsApiUpdate: false,
  }))
}

const bookmarks = createBenchmarkBookmarks(10_000)
const index = createSearchIndex(bookmarks)

describe('in-memory bookmark search benchmark', () => {
  bench('builds an in-memory index for 10,000 bookmarks', () => {
    createSearchIndex(bookmarks)
  })

  bench('scans 10,000 documents for a selective query', () => {
    filterBookmarks(index, 'engineering note', 'all', 'all', 'all')
  })

  bench('scans 10,000 documents when there is no match', () => {
    filterBookmarks(index, 'does-not-exist', 'all', 'all', 'all')
  })
})
