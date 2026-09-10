import { isAbsolute, relative, resolve } from 'node:path'

export const RENDERER_SCHEME = 'spotlight'
export const RENDERER_ORIGIN = `${RENDERER_SCHEME}://renderer`
export const RENDERER_ENTRY_URL = `${RENDERER_ORIGIN}/index.html`

export function isTrustedRendererUrl(requestUrl: string): boolean {
  try {
    const url = new URL(requestUrl)
    return (
      url.protocol === `${RENDERER_SCHEME}:` &&
      url.hostname === 'renderer' &&
      url.username === '' &&
      url.password === '' &&
      url.port === ''
    )
  } catch {
    return false
  }
}

export function resolveRendererAssetPath(rendererRoot: string, requestUrl: string): string | null {
  let url: URL

  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }

  if (!isTrustedRendererUrl(requestUrl)) return null

  let requestedPath: string
  try {
    requestedPath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
  } catch {
    return null
  }

  const assetPath = resolve(rendererRoot, requestedPath)
  const relativeAssetPath = relative(rendererRoot, assetPath)
  if (relativeAssetPath.startsWith('..') || isAbsolute(relativeAssetPath)) return null

  return assetPath
}
