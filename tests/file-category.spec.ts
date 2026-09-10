import { describe, expect, it } from 'vitest'
import type { FileEntry } from '../electron/shared/types'
import {
  categorizeEntries,
  getFileCategory,
  getFileIcon
} from '../src/features/search/file-category'

function entry(id: number, extension: string | null, entryType: FileEntry['entryType'] = 'file') {
  return {
    id,
    normalizedPath: `c:/fixture/${id}`,
    displayPath: `C:\\fixture\\${id}`,
    name: `fixture-${id}`,
    parentPath: 'C:\\fixture',
    entryType,
    extension,
    size: 0,
    modifiedAt: null,
    indexedAt: '2026-01-01T00:00:00.000Z',
    isAvailable: true,
    openCount: 0,
    lastOpenedAt: null,
    isFavorite: false
  } satisfies FileEntry
}

describe('Spotlight file categories', () => {
  it('normalizes extension casing and leading dots', () => {
    expect(getFileCategory(entry(1, 'PDF'))).toBe('documents')
    expect(getFileIcon(entry(1, 'PDF'))).toBe('pdf')
  })

  it('classifies common result types', () => {
    expect(getFileCategory(entry(1, null, 'directory'))).toBe('folders')
    expect(getFileCategory(entry(2, '.exe'))).toBe('apps')
    expect(getFileCategory(entry(3, '.7z'))).toBe('archives')
    expect(getFileCategory(entry(4, '.heic'))).toBe('photos')
    expect(getFileCategory(entry(5, '.mkv'))).toBe('videos')
    expect(getFileCategory(entry(6, '.flac'))).toBe('audio')
  })

  it('keeps original result indexes while grouping categories', () => {
    const groups = categorizeEntries([
      entry(1, '.png'),
      entry(2, null, 'directory'),
      entry(3, '.pdf')
    ])
    expect(groups.map((group) => group.id)).toEqual(['folders', 'documents', 'photos'])
    expect(groups.flatMap((group) => group.entries.map(({ index }) => index))).toEqual([1, 2, 0])
  })
})
