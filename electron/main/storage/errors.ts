/** Identifies capacity failures without exposing private paths or SQL payloads. */
export function isStorageCapacityError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code).toUpperCase() : ''
  const message = 'message' in error ? String(error.message).toLowerCase() : ''
  return (
    code === 'ENOSPC' ||
    code === 'SQLITE_FULL' ||
    message.includes('database or disk is full') ||
    message.includes('no space left on device')
  )
}
