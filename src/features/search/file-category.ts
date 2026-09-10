import type { FileEntry } from '../../../electron/shared/types'
import type { IconName } from '../../components/Icon/Icon'

export type FileCategory =
  'folders' | 'documents' | 'apps' | 'archives' | 'photos' | 'videos' | 'audio' | 'other'

export interface FileCategoryDefinition {
  id: FileCategory
  label: string
  icon: IconName
}

export const FILE_CATEGORIES: FileCategoryDefinition[] = [
  { id: 'folders', label: 'Folders', icon: 'folder' },
  { id: 'documents', label: 'Documents', icon: 'document' },
  { id: 'apps', label: 'Apps', icon: 'app' },
  { id: 'archives', label: 'Compressed', icon: 'archive' },
  { id: 'photos', label: 'Photos', icon: 'image' },
  { id: 'videos', label: 'Videos', icon: 'video' },
  { id: 'audio', label: 'Audio', icon: 'audio' },
  { id: 'other', label: 'Other', icon: 'file' }
]

const extensionGroups: Record<Exclude<FileCategory, 'folders' | 'other'>, Set<string>> = {
  documents: new Set([
    '.pdf',
    '.doc',
    '.docx',
    '.txt',
    '.md',
    '.rtf',
    '.odt',
    '.xls',
    '.xlsx',
    '.csv',
    '.ppt',
    '.pptx',
    '.pages',
    '.numbers',
    '.key'
  ]),
  apps: new Set(['.exe', '.msi', '.app', '.appx', '.msix', '.lnk', '.bat', '.cmd']),
  archives: new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz', '.cab']),
  photos: new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.svg',
    '.bmp',
    '.tif',
    '.tiff',
    '.heic',
    '.avif'
  ]),
  videos: new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.wmv', '.m4v', '.mpeg', '.mpg']),
  audio: new Set(['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma', '.aiff'])
}

export function normalizeExtension(extension: string | null): string {
  if (!extension) return ''
  const normalized = extension.trim().toLowerCase()
  return normalized.startsWith('.') ? normalized : `.${normalized}`
}

export function getFileCategory(entry: FileEntry): FileCategory {
  if (entry.entryType === 'directory') return 'folders'

  const extension = normalizeExtension(entry.extension)
  for (const [category, extensions] of Object.entries(extensionGroups) as Array<
    [Exclude<FileCategory, 'folders' | 'other'>, Set<string>]
  >) {
    if (extensions.has(extension)) return category
  }
  return 'other'
}

export function getFileIcon(entry: FileEntry): IconName {
  if (entry.entryType === 'directory') return 'folder'
  if (normalizeExtension(entry.extension) === '.pdf') return 'pdf'

  const category = getFileCategory(entry)
  return FILE_CATEGORIES.find((definition) => definition.id === category)?.icon ?? 'file'
}

export interface CategorizedEntry {
  entry: FileEntry
  index: number
}

export function categorizeEntries(
  results: FileEntry[]
): Array<FileCategoryDefinition & { entries: CategorizedEntry[] }> {
  const buckets = new Map<FileCategory, CategorizedEntry[]>()

  results.forEach((entry, index) => {
    const category = getFileCategory(entry)
    const entries = buckets.get(category) ?? []
    entries.push({ entry, index })
    buckets.set(category, entries)
  })

  return FILE_CATEGORIES.flatMap((definition) => {
    const entries = buckets.get(definition.id)
    return entries?.length ? [{ ...definition, entries }] : []
  })
}
