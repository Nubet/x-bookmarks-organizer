import type {BookmarkPreview} from '../../shared/types'

export type MediaType = 'all' | 'image' | 'video' | 'link' | 'text'
export type SortMode = 'sync-desc' | 'posted-desc'

export interface SearchDocument {
  bookmark: BookmarkPreview
  text: string
  author: string
  username: string
  tags: string[]
}

export interface SearchIndex {
  documents: SearchDocument[]
}

const urlPattern = /(?:https?:\/\/|www\.)\S+/i

export function createSearchIndex(bookmarks: BookmarkPreview[]): SearchIndex {
  return {
    documents: bookmarks.map((bookmark) => ({
      bookmark,
      text: normalize(bookmark.text),
      author: normalize(bookmark.author.name),
      username: normalize(bookmark.author.username),
      tags: bookmark.tags.map(normalize),
    })),
  }
}

export function createSearchTokens(input: Pick<BookmarkPreview, 'text' | 'author' | 'tags'>) {
  return Array.from(new Set(
    `${input.text} ${input.author.name} ${input.author.username} ${input.tags.join(' ')}`
      .split(/[^a-zA-Z0-9_]+/)
      .map(normalize)
      .filter(Boolean)
  ))
}

export function filterBookmarks(
  index: SearchIndex,
  query: string,
  folderId: string,
  tag: string,
  mediaType: MediaType
) {
  const normalizedQuery = normalize(query)
  const usernameQuery = normalizedQuery.match(/^@([a-z0-9_]+)$/)?.[1]
  const tagQuery = normalizedQuery.match(/^#([a-z0-9_]+)$/)?.[1]

  return index.documents
    .filter((document) => {
      const matchesQuery = usernameQuery
        ? document.username === usernameQuery
        : tagQuery
          ? document.tags.some((bookmarkTag) => bookmarkTag.replace(/^#/, '') === tagQuery)
            || document.text.includes(`#${tagQuery}`)
          : !normalizedQuery
            || document.text.includes(normalizedQuery)
            || document.author.includes(normalizedQuery)
            || document.username.includes(normalizedQuery)
            || document.tags.some((bookmarkTag) => bookmarkTag.includes(normalizedQuery))

      const matchesMedia = mediaType === 'all'
        || (mediaType === 'text' && !document.bookmark.media?.length)
        || (mediaType === 'link' && hasLink(document.bookmark))
        || document.bookmark.media?.some((media) => media.type === mediaType)

      return matchesQuery
        && matchesMedia
        && (folderId === 'all' || document.bookmark.folderIds.includes(folderId))
        && (tag === 'all' || document.bookmark.tags.includes(tag))
    })
    .map((document) => document.bookmark)
}

export function sortBookmarks(bookmarks: BookmarkPreview[], sortMode: SortMode) {
  return [...bookmarks].sort((left, right) => {
    const leftValue = getSortTimestamp(left, sortMode) ?? 0
    const rightValue = getSortTimestamp(right, sortMode) ?? 0
    return rightValue - leftValue
  })
}

export function countMedia(bookmarks: BookmarkPreview[]) {
  const counts = {All: bookmarks.length, Images: 0, Videos: 0, Links: 0, 'Text only': 0}
  for (const bookmark of bookmarks) {
    if (!bookmark.media?.length) counts['Text only'] += 1
    if (hasLink(bookmark)) counts.Links += 1
    for (const media of bookmark.media ?? []) counts[media.type === 'video' ? 'Videos' : 'Images'] += 1
  }
  return counts
}

export function hasLink(bookmark: BookmarkPreview) {
  return urlPattern.test(bookmark.text)
}

function getSortTimestamp(bookmark: BookmarkPreview, sortMode: SortMode) {
  if (sortMode === 'sync-desc') return bookmark.updatedAt || null
  return Date.parse(bookmark.postedAt ?? '') || null
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}
