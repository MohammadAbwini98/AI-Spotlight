import { extname } from 'path'

const BLOCKED_LAUNCH_EXTENSIONS = new Set([
  '.appref-ms',
  '.bat',
  '.cmd',
  '.com',
  '.cpl',
  '.exe',
  '.hta',
  '.inf',
  '.ins',
  '.isp',
  '.jar',
  '.js',
  '.jse',
  '.lnk',
  '.msc',
  '.msi',
  '.msp',
  '.mst',
  '.pif',
  '.ps1',
  '.reg',
  '.scr',
  '.sct',
  '.url',
  '.vb',
  '.vbe',
  '.vbs',
  '.ws',
  '.wsc',
  '.wsf',
  '.wsh'
])

/** Returns a user-facing reason when a path must not be launched through the OS shell. */
export function getUnsafeLaunchReason(path: string): string | null {
  const extension = extname(path).toLowerCase()
  if (!BLOCKED_LAUNCH_EXTENSIONS.has(extension)) return null
  return `Opening ${extension || 'this file type'} is blocked for security. Use Show in Explorer instead.`
}
