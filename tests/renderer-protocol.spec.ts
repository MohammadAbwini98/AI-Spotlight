import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  RENDERER_ENTRY_URL,
  isTrustedRendererUrl,
  resolveRendererAssetPath
} from '../electron/main/renderer-protocol'

describe('packaged renderer protocol', () => {
  const rendererRoot = resolve('out/renderer')

  it('maps the trusted entry page and same-origin assets', () => {
    expect(resolveRendererAssetPath(rendererRoot, RENDERER_ENTRY_URL)).toBe(
      join(rendererRoot, 'index.html')
    )
    expect(
      resolveRendererAssetPath(rendererRoot, 'spotlight://renderer/assets/index.js?version=1')
    ).toBe(join(rendererRoot, 'assets', 'index.js'))
  })

  it('maps the renderer origin root to the entry page', () => {
    expect(resolveRendererAssetPath(rendererRoot, 'spotlight://renderer/')).toBe(
      join(rendererRoot, 'index.html')
    )
  })

  it('recognizes only the privileged renderer origin for IPC', () => {
    expect(isTrustedRendererUrl('spotlight://renderer/index.html')).toBe(true)
    expect(isTrustedRendererUrl('spotlight://renderer/settings?section=appearance')).toBe(true)
    expect(isTrustedRendererUrl('spotlight://external/index.html')).toBe(false)
    expect(isTrustedRendererUrl('file:///index.html')).toBe(false)
  })

  it('rejects other schemes, hosts, malformed escapes, and traversal', () => {
    expect(resolveRendererAssetPath(rendererRoot, 'file:///index.html')).toBeNull()
    expect(resolveRendererAssetPath(rendererRoot, 'spotlight://external/index.html')).toBeNull()
    expect(resolveRendererAssetPath(rendererRoot, 'spotlight://renderer/%E0%A4%A')).toBeNull()
    expect(
      resolveRendererAssetPath(rendererRoot, 'spotlight://renderer/..%2F..%2Fsecrets.txt')
    ).toBeNull()
  })
})
