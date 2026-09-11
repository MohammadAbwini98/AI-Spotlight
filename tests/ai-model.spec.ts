import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultManagedModelsDir,
  explicitModelPathFromEnv,
  loadModelManifest,
  resolveModelFile,
  type ModelManifest
} from '../electron/main/ai/model-resolver'
import { validateModelFile } from '../electron/main/ai/model-validator'

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

function makeManifest(overrides: Partial<ModelManifest> = {}): ModelManifest {
  return {
    id: 'gemma-4-12b-it-q4-k-m',
    name: 'Gemma 4 12B',
    family: 'gemma',
    format: 'gguf',
    quantization: 'Q4_K_M',
    filename: 'gemma-4-12b-it-Q4_K_M.gguf',
    sha256: null,
    verifySha256: false,
    minimumFileBytes: 100,
    maximumFileBytes: 1000,
    minimumRamGb: 24,
    recommendedRamGb: 32,
    runtime: 'llama.cpp',
    runtimeMinimumVersion: 'b5000',
    ...overrides
  }
}

function makeModelFile(directory: string, filename: string, size: number): string {
  const path = join(directory, filename)
  writeFileSync(path, Buffer.alloc(size, 7))
  return path
}

describe('AI model manifest', () => {
  it('ships a structured manifest without fake checksums', () => {
    const manifest = loadModelManifest('resources/ai/model-manifest.json')
    expect(manifest.id).toBe('gemma-4-12b-it-q4-k-m')
    expect(manifest.format).toBe('gguf')
    expect(manifest.quantization).toBe('Q4_K_M')
    expect(manifest.runtime).toBe('llama.cpp')
    // No fabricated hash: verification stays disabled until a canonical hash ships.
    expect(manifest.sha256).toBeNull()
    expect(manifest.verifySha256).toBe(false)
  })

  it('rejects malformed manifests', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ai-manifest-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'model-manifest.json')
    writeFileSync(path, JSON.stringify({ id: 'x' }))
    expect(() => loadModelManifest(path)).toThrow(/malformed/i)
  })
})

describe('AI model resolution', () => {
  it('prefers the explicit path, then the managed directory, then missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-resolve-'))
    temporaryDirectories.push(root)
    const manifest = makeManifest()
    const managedDir = join(root, 'models')
    mkdirSync(managedDir, { recursive: true })

    expect(resolveModelFile(manifest, { managedModelsDir: managedDir }).source).toBe('missing')

    const managed = makeModelFile(managedDir, manifest.filename, 200)
    expect(resolveModelFile(manifest, { managedModelsDir: managedDir })).toMatchObject({
      path: managed,
      source: 'managed'
    })

    const explicitDir = join(root, 'explicit')
    mkdirSync(explicitDir, { recursive: true })
    const explicit = makeModelFile(explicitDir, 'custom.gguf', 200)
    expect(
      resolveModelFile(manifest, { managedModelsDir: managedDir, explicitModelPath: explicit })
    ).toMatchObject({ path: explicit, source: 'explicit' })
  })

  it('never scans the machine and ignores renderer input by construction', () => {
    const resolverSource = readFileSync('electron/main/ai/model-resolver.ts', 'utf8')
    expect(resolverSource).not.toMatch(/readdir|glob|walk/i)
  })

  it('derives the managed directory from the app data directory', () => {
    expect(defaultManagedModelsDir('C:\\data')).toBe(join('C:\\data', 'models'))
  })

  it('reads the explicit override only from the environment variable', () => {
    expect(explicitModelPathFromEnv({})).toBeNull()
    expect(explicitModelPathFromEnv({ SPOTLIGHT_TODO_MODEL_PATH: 'C:\\models\\m.gguf' })).toBe(
      'C:\\models\\m.gguf'
    )
  })
})

describe('AI model validation', () => {
  it('reports missing models without throwing', async () => {
    expect(await validateModelFile(makeManifest(), null)).toEqual({
      ok: false,
      code: 'AI_MODEL_NOT_FOUND'
    })
  })

  it('rejects directories, wrong extensions, and out-of-range sizes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-validate-'))
    temporaryDirectories.push(root)
    const manifest = makeManifest()

    expect(await validateModelFile(manifest, root)).toEqual({
      ok: false,
      code: 'AI_MODEL_INVALID'
    })
    const wrongExt = makeModelFile(root, 'model.bin', 200)
    expect(await validateModelFile(manifest, wrongExt)).toEqual({
      ok: false,
      code: 'AI_MODEL_INVALID'
    })
    const tiny = makeModelFile(root, manifest.filename, 10)
    expect(await validateModelFile(manifest, tiny)).toEqual({
      ok: false,
      code: 'AI_MODEL_INVALID'
    })
  })

  it('rejects unexpected filenames and accepts the configured build', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-validate-name-'))
    temporaryDirectories.push(root)
    const manifest = makeManifest()
    const other = makeModelFile(root, 'other-model.gguf', 200)
    expect(await validateModelFile(manifest, other)).toEqual({
      ok: false,
      code: 'AI_MODEL_UNSUPPORTED'
    })
    const valid = makeModelFile(root, manifest.filename, 200)
    expect(await validateModelFile(manifest, valid)).toEqual({ ok: true, path: valid })
  })

  it('enforces SHA-256 only when the manifest carries a canonical hash', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ai-validate-hash-'))
    temporaryDirectories.push(root)
    const manifest = makeManifest({ sha256: '0'.repeat(64), verifySha256: true })
    const valid = makeModelFile(root, manifest.filename, 200)
    expect(await validateModelFile(manifest, valid)).toEqual({
      ok: false,
      code: 'AI_MODEL_HASH_MISMATCH'
    })
  })
})
