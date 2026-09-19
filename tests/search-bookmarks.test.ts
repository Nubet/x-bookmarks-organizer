import {describe, expect, it} from 'vitest'
import type {BookmarkPreview} from '../src/shared/types'
import {countMedia, createSearchIndex, createSearchTokens, filterBookmarks, hasLink, shouldUseTokenIndex, sortBookmarks} from '../src/domain/search/search-bookmarks'

function createBookmark(overrides: Partial<BookmarkPreview> = {}): BookmarkPreview {
  return {
    id: '1',
    tweetId: '1',
    text: 'Build a fast search index',
    author: {name: 'Norbert Fila', username: 'nubet'},
    tags: ['engineering'],
    folderIds: [],
    createdAt: 1,
    updatedAt: 1,
    source: 'x',
    needsApiUpdate: false,
    ...overrides,
  }
}

describe('bookmark search', () => {
  it('matches normalized text, authors and tags', () => {
    const bookmarks = [
      createBookmark({text: 'Praca z indeksami', author: {name: 'Zoë', username: 'zoe'}, tags: ['Performance']}),
      createBookmark({id: '2', tweetId: '2', text: 'Something else', author: {name: 'Bob', username: 'bob'}, tags: []}),
    ]
    const index = createSearchIndex(bookmarks)

    expect(filterBookmarks(index, 'praca', 'all', 'all', 'all').map((bookmark) => bookmark.id)).toEqual(['1'])
    expect(filterBookmarks(index, 'zoe', 'all', 'all', 'all').map((bookmark) => bookmark.id)).toEqual(['1'])
    expect(filterBookmarks(index, 'performance', 'all', 'all', 'all').map((bookmark) => bookmark.id)).toEqual(['1'])
    expect(filterBookmarks(index, 'fast search', 'all', 'all', 'all').map((bookmark) => bookmark.id)).toEqual([])
    expect(filterBookmarks(index, 'indeks', 'all', 'all', 'all').map((bookmark) => bookmark.id)).toEqual(['1'])
  })

  it('supports exact username and hashtag queries', () => {
    const bookmarks = [
      createBookmark({tags: ['#Design']}),
      createBookmark({id: '2', tweetId: '2', author: {name: 'Bob', username: 'bob'}, text: '#design systems'}),
    ]
    const index = createSearchIndex(bookmarks)

    expect(filterBookmarks(index, '@nubet', 'all', 'all', 'all').map((bookmark) => bookmark.id)).toEqual(['1'])
    expect(filterBookmarks(index, '#design', 'all', 'all', 'all').map((bookmark) => bookmark.id)).toEqual(['1', '2'])
  })

  it('applies media, folder and tag filters together', () => {
    const bookmark = createBookmark({
      media: [{type: 'image', url: 'image.jpg'}],
      folderIds: ['work'],
      tags: ['important'],
    })
    const index = createSearchIndex([bookmark])

    expect(filterBookmarks(index, '', 'work', 'important', 'image')).toEqual([bookmark])
    expect(filterBookmarks(index, '', 'personal', 'important', 'image')).toEqual([])
    expect(filterBookmarks(index, '', 'work', 'important', 'text')).toEqual([])
  })

  it('keeps link and text-only filters independent', () => {
    const link = createBookmark({id: '2', tweetId: '2', text: 'Read https://t.co/example'})
    const index = createSearchIndex([link])

    expect(filterBookmarks(index, '', 'all', 'all', 'link')).toEqual([link])
    expect(filterBookmarks(index, '', 'all', 'all', 'text')).toEqual([link])
  })

  it('counts media attachments and does not mutate bookmarks', () => {
    const bookmarks = [
      createBookmark({media: [
        {type: 'image', url: 'image-1.jpg'},
        {type: 'image', url: 'image-2.jpg'},
      ]}),
      createBookmark({id: '2', tweetId: '2', text: 'Read https://t.co/example', media: [{type: 'video', url: 'video.mp4'}]}),
      createBookmark({id: '3', tweetId: '3', text: 'Plain text'}),
    ]
    const before = structuredClone(bookmarks)
    const counts = countMedia(bookmarks)

    expect(counts).toEqual({All: 3, Images: 2, Videos: 1, Links: 1, 'Text only': 1})
    expect(hasLink(bookmarks[1])).toBe(true)
    expect(bookmarks).toEqual(before)
  })

  it('creates unique search tokens for indexed queries', () => {
    expect(createSearchTokens({text: 'Fast search', author: {name: 'Nubet', username: 'nubet'}, tags: ['Search']})).toEqual(['fast', 'search', 'nubet'])
  })

  it('uses the token index only where substring search stays correct', () => {
    expect(shouldUseTokenIndex('typescript', ['typescript'])).toBe(false)
    expect(shouldUseTokenIndex('type', ['type'])).toBe(false)
    expect(shouldUseTokenIndex('typescript patterns', ['typescript', 'patterns'])).toBe(true)
    expect(shouldUseTokenIndex('@nubet', ['nubet'])).toBe(true)
    expect(shouldUseTokenIndex('#engineering', ['engineering'])).toBe(true)
  })

  it('sorts by posted date and puts missing dates last', () => {
    const older = createBookmark({postedAt: '2024-01-01T00:00:00.000Z'})
    const newer = createBookmark({id: '2', tweetId: '2', postedAt: '2025-01-01T00:00:00.000Z', updatedAt: 2})
    const missing = createBookmark({id: '3', tweetId: '3'})

    expect(sortBookmarks([missing, older, newer], 'posted-desc').map((bookmark) => bookmark.id)).toEqual(['2', '1', '3'])
    expect(sortBookmarks([older, newer], 'sync-desc').map((bookmark) => bookmark.id)).toEqual(['2', '1'])
  })
})
