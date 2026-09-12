import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { importModelFile } from '../electron/main/ai/model-import'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    try {
      rmSync(directory, { recursive: true, force: true })
    } catch {
      // Ignore cleanup failures.
    }
  }
})

function makeManifestHost(): { resourcesDir: string; filename: string } {
  const root = mkdtempSync(join(tmpdir(), 'ai-import-'))
  temporaryDirectories.push(root)
  const resourcesDir = join(root, 'resources')
  mkdirSync(join(resourcesDir, 'ai'), { recursive: true })
  const manifest = {
    id: 'test-model',
    name: 'Test',
    family: 'test',
    format: 'gguf',
    quantization: 'Q4_K_M',
    filename: 'test-model-Q4_K_M.gguf',
    sha256: null,
    verifySha256: false,
    minimumFileBytes: 100,
    maximumFileBytes: 1000,
    minimumRamGb: 1,
    recommendedRamGb: 2,
    runtime: 'llama.cpp',
    runtimeMinimumVersion: 'b5000'
  }
  writeFileSync(join(resourcesDir, 'ai', 'model-manifest.json'), JSON.stringify(manifest))
  return { resourcesDir, filename: manifest.filename }
}

describe('AI native model import', () => {
  it('rejects non-GGUF selections', async () => {
    const { resourcesDir } = makeManifestHost()
    const managedDir = join(resourcesDir, '..', 'models')
    const bad = join(resourcesDir, 'notes.txt')
    writeFileSync(bad, 'x'.repeat(200))
    await expect(
      importModelFile(bad, { resourcesDir, managedModelsDir: managedDir })
    ).rejects.toMatchObject({
      code: 'AI_MODEL_INVALID'
    })
  })

  it('rejects missing selections', async () => {
    const { resourcesDir } = makeManifestHost()
    await expect(
      importModelFile(join(resourcesDir, 'absent.gguf'), {
        resourcesDir,
        managedModelsDir: join(resourcesDir, '..', 'models')
      })
    ).rejects.toMatchObject({ code: 'AI_MODEL_NOT_FOUND' })
  })

  it('copies a valid file into the managed directory under the manifest name', async () => {
    const { resourcesDir, filename } = makeManifestHost()
    const managedDir = join(resourcesDir, '..', 'models')
    const source = join(resourcesDir, 'downloaded-name.gguf')
    writeFileSync(source, Buffer.alloc(200, 3))
    const imported = await importModelFile(source, { resourcesDir, managedModelsDir: managedDir })
    expect(imported.destination).toBe(join(managedDir, filename))
  })

  it('leaves no apparently valid partial model on failure', async () => {
    const { resourcesDir, filename } = makeManifestHost()
    const managedDir = join(resourcesDir, '..', 'models')
    const tiny = join(resourcesDir, 'tiny.gguf')
    writeFileSync(tiny, Buffer.alloc(10, 3))
    await expect(
      importModelFile(tiny, { resourcesDir, managedModelsDir: managedDir })
    ).rejects.toBeDefined()
    // The undersized source fails pre-validation, so no destination is written.
    expect(() => statSync(join(managedDir, filename))).toThrow()
  })

  it('reports throttled progress while copying', async () => {
    const { resourcesDir, filename } = makeManifestHost()
    const managedDir = join(resourcesDir, '..', 'models')
    const source = join(resourcesDir, 'big.gguf')
    writeFileSync(source, Buffer.alloc(1000, 9))
    const seen: Array<{ bytesCopied: number; totalBytes: number }> = []
    const imported = await importModelFile(
      source,
      { resourcesDir, managedModelsDir: managedDir },
      { onProgress: (progress) => seen.push({ ...progress }) }
    )
    expect(imported.destination).toBe(join(managedDir, filename))
    expect(seen.length).toBeGreaterThan(0)
    const last = seen[seen.length - 1]
    expect(last).toEqual({ bytesCopied: 1000, totalBytes: 1000 })
    expect(seen.every((progress) => progress.totalBytes === 1000)).toBe(true)
  })

  it('cancels an in-flight copy without leaving a partial model', async () => {
    const { resourcesDir, filename } = makeManifestHost()
    const managedDir = join(resourcesDir, '..', 'models')
    const source = join(resourcesDir, 'cancel.gguf')
    writeFileSync(source, Buffer.alloc(500, 11))
    const abort = new AbortController()
    const pending = importModelFile(
      source,
      { resourcesDir, managedModelsDir: managedDir },
      {
        signal: abort.signal,
        onProgress: () => abort.abort()
      }
    )
    await expect(pending).rejects.toMatchObject({ code: 'AI_GENERATION_CANCELLED' })
    expect(() => statSync(join(managedDir, filename))).toThrow()
    expect(() => statSync(`${join(managedDir, filename)}.partial`)).toThrow()
  })
})
