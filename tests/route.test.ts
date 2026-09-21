import {describe, expect, it} from 'vitest'
import {getBookmarkFolderId, isBookmarksRoute} from '../src/content/route'

describe('X bookmark routes', () => {
  it('accepts current and legacy bookmark routes', () => {
    expect(isBookmarksRoute('/i/history')).toBe(true)
    expect(isBookmarksRoute('/i/history/bookmarks/123')).toBe(true)
    expect(isBookmarksRoute('/i/bookmarks/123')).toBe(true)
    expect(isBookmarksRoute('/i/history/likes')).toBe(false)
  })

  it('extracts folder ids only from bookmark folder routes', () => {
    expect(getBookmarkFolderId('/i/history/bookmarks/123')).toBe('123')
    expect(getBookmarkFolderId('/i/history')).toBe(null)
    expect(getBookmarkFolderId('/i/history/bookmarks/not-a-number')).toBe(null)
  })
})
