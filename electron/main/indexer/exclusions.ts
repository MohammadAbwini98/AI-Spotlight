import { homedir } from 'os'
import { existsSync } from 'fs'
import { isAbsolute, join, normalize, parse, resolve, sep } from 'path'

/** Directories that are always excluded from scanning. */
const SYSTEM_EXCLUSIONS_WIN = [
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  '$Recycle.Bin',
  'System Volume Information',
  'AppData\\Local\\Temp',
  'AppData\\Local\\Microsoft\\Windows\\INetCache',
  'AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache',
  'AppData\\Roaming\\npm',
  'AppData\\Local\\npm-cache'
]

const ALWAYS_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.cache',
  'dist',
  'dist-electron',
  'out',
  '.next',
  '.nuxt',
  '.vite',
  'coverage',
  '.nyc_output',
  'thumbs.db',
  'system volume information',
  '$recycle.bin'
])

const ALWAYS_SKIP_EXTENSIONS = new Set([
  '.tmp',
  '.temp',
  '.bak',
  '.log',
  '.lock',
  '.pid',
  '.dump',
  '.dmp',
  '.crdownload'
])

/**
 * Returns the default scan roots for the current user.
 * Only includes confirmed user-writable directories.
 */
export function getDefaultScanRoots(): string[] {
  const home = homedir()
  const candidates = [
    join(home, 'Desktop'),
    join(home, 'Documents'),
    join(home, 'Downloads'),
    join(home, 'Pictures'),
    join(home, 'Videos'),
    join(home, 'Music'),
    join(home, 'OneDrive'),
    join(home, 'OneDrive - Personal')
  ]

  return candidates.filter((candidate) => existsSync(candidate))
}

/**
 * Removes duplicate roots and roots already covered by a selected parent.
 * This prevents the same directory tree from being traversed more than once
 * during a single scan (for example, OneDrive plus OneDrive\Documents).
 */
export function minimizeScanRoots(roots: string[]): string[] {
  const uniqueRoots = new Map<string, string>()

  for (const root of roots) {
    const normalizedRoot = normalize(root)
    uniqueRoots.set(normalizedRoot.toLowerCase(), normalizedRoot)
  }

  const orderedRoots = [...uniqueRoots.entries()].sort(([a], [b]) => a.length - b.length)
  const accepted: Array<{ key: string; path: string }> = []

  for (const [key, path] of orderedRoots) {
    const isCovered = accepted.some((parent) => key.startsWith(`${parent.key}${sep}`))
    if (!isCovered) accepted.push({ key, path })
  }

  return accepted.map((root) => root.path)
}

/** Removes malformed, unsafe, duplicate, and parent-covered persisted roots. */
export function sanitizeScanRoots(roots: unknown): string[] {
  if (!Array.isArray(roots)) return []
  const safeRoots = roots
    .filter(
      (root): root is string =>
        typeof root === 'string' && root.length <= 32_767 && isAbsolute(root)
    )
    .map((root) => normalize(resolve(root)))
    .filter((root) => validateScanRoot(root) === null)
  return minimizeScanRoots(safeRoots)
}

/**
 * Returns true if the given absolute path should be skipped during scanning.
 */
export function shouldExclude(absolutePath: string, name: string): boolean {
  // Always-skip directory names
  if (ALWAYS_SKIP_DIRS.has(name.toLowerCase())) return true

  // System exclusions (prefix match, case-insensitive on Windows)
  const lower = absolutePath.toLowerCase()
  for (const excl of SYSTEM_EXCLUSIONS_WIN) {
    const excludedPath = excl.toLowerCase()
    if (lower === excludedPath || lower.startsWith(`${excludedPath}\\`)) return true
  }

  return false
}

/**
 * Returns true if a file's extension should cause it to be skipped.
 */
export function shouldSkipExtension(ext: string): boolean {
  return ALWAYS_SKIP_EXTENSIONS.has(ext.toLowerCase())
}

/**
 * Validates a user-supplied scan root.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateScanRoot(absolutePath: string): string | null {
  if (!absolutePath || !isAbsolute(absolutePath)) return 'Scan roots must be absolute paths.'
  if (/^(\\\\|\/\/)/.test(absolutePath)) {
    return 'Network, UNC, and device paths are not allowed as scan roots.'
  }

  const normalizedPath = normalize(resolve(absolutePath))
  const lower = normalizedPath.toLowerCase()

  if (normalize(parse(normalizedPath).root).toLowerCase() === lower) {
    return 'Cannot scan an entire drive. Please select a specific folder.'
  }

  // Reject OS system paths
  const forbidden = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    'c:\\programdata',
    process.env.SystemRoot,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.ProgramData
  ]
    .filter((path): path is string => Boolean(path))
    .map((path) => normalize(resolve(path)).toLowerCase())
  for (const path of forbidden) {
    if (lower === path || lower.startsWith(`${path}${sep}`)) {
      return 'Cannot scan system directories.'
    }
  }

  const home = normalize(resolve(homedir())).toLowerCase()
  if (lower === home) return 'Select a folder inside your profile, not the entire profile.'
  const sensitiveProfilePaths = ['AppData', '.ssh', '.gnupg'].map((name) =>
    normalize(join(home, name)).toLowerCase()
  )
  for (const path of sensitiveProfilePaths) {
    if (lower === path || lower.startsWith(`${path}${sep}`)) {
      return 'Cannot scan sensitive profile directories.'
    }
  }

  return null
}
