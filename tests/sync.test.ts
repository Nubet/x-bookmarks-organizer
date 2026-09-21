import {describe, expect, it} from 'vitest'
import type {BookmarkCapture, BookmarkPreview} from '../src/shared/types'
import {selectSyncCaptures, shouldStopDeltaSync} from '../src/storage/repositories'
import {isQuickSyncThrottled} from '../src/shared/sync-throttle'

const capture = (tweetId: string): BookmarkCapture => ({
  tweetId,
  text: tweetId,
  author: {name: tweetId, username: tweetId},
})

describe('bookmark sync decisions', () => {
  it('stops delta sync when a page is fully known and complete', () => {
    const page = [capture('1'), capture('2')]
    const existing: BookmarkPreview[] = [
      {...page[0], id: '1', tags: [], folderIds: [], createdAt: 1, updatedAt: 1, source: 'x', needsApiUpdate: false},
      {...page[1], id: '2', tags: [], folderIds: [], createdAt: 1, updatedAt: 1, source: 'x', needsApiUpdate: false},
    ]
    const selected = selectSyncCaptures(page, existing, 'delta')

    expect(selected).toEqual([])
    expect(shouldStopDeltaSync(page, selected, 'delta')).toBe(true)
  })

  it('keeps new and incomplete records in delta sync', () => {
    const page = [capture('1'), capture('2')]
    const existing: Array<BookmarkPreview | undefined> = [
      {...page[0], id: '1', tags: [], folderIds: [], createdAt: 1, updatedAt: 1, source: 'x', needsApiUpdate: true},
      undefined,
    ]

    expect(selectSyncCaptures(page, existing, 'delta')).toEqual(page)
    expect(shouldStopDeltaSync(page, page, 'delta')).toBe(false)
  })

  it('throttles quick syncs for five seconds after a completed sync', () => {
    expect(isQuickSyncThrottled(10_000, 14_999)).toBe(true)
    expect(isQuickSyncThrottled(10_000, 15_000)).toBe(false)
  })

  it('allows the first quick sync when no sync has completed yet', () => {
    expect(isQuickSyncThrottled(null, 10_000)).toBe(false)
  })
})
