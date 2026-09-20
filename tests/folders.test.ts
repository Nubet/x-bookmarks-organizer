import {describe, expect, it} from 'vitest'
import {addFolderIds, folderNameKey, normalizeFolderName, removeFolderIds} from '../src/domain/folders/folder-operations'

describe('folder operations', () => {
  it('normalizes names for display and duplicate checks', () => {
    expect(normalizeFolderName('  Work   projects  ')).toBe('Work projects')
    expect(folderNameKey('  Work   projects  ')).toBe('work projects')
  })

  it('adds folder ids idempotently without mutating input', () => {
    const current = ['work']
    expect(addFolderIds(current, ['personal', 'work'])).toEqual(['work', 'personal'])
    expect(current).toEqual(['work'])
  })

  it('removes only requested folder ids without mutating input', () => {
    const current = ['work', 'personal', 'read-later']
    expect(removeFolderIds(current, ['personal'])).toEqual(['work', 'read-later'])
    expect(current).toEqual(['work', 'personal', 'read-later'])
  })
})
