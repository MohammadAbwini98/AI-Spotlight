import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AI_CONFIG } from './ai-config'

export interface ModelManifest {
  id: string
  name: string
  family: string
  format: string
  quantization: string
  filename: string
  sha256: string | null
  verifySha256: boolean
  minimumFileBytes: number
  maximumFileBytes: number
  minimumRamGb: number
  recommendedRamGb: number
  runtime: string
  runtimeMinimumVersion: string
}

export interface ResolvedModel {
  manifest: ModelManifest
  /** Absolute model file path, or null when no installed file was found. */
  path: string | null
  source: 'explicit' | 'managed' | 'missing'
}

/**
 * Loads the model manifest. In production the manifest ships as an
 * extraResource (`resources/ai/model-manifest.json`); in development it is
 * read from the repository. Throws on malformed manifests.
 */
export function loadModelManifest(manifestPath: string): ModelManifest {
  const raw = readFileSync(manifestPath, 'utf8')
  const manifest = JSON.parse(raw) as Partial<ModelManifest>
  if (
    typeof manifest.id !== 'string' ||
    typeof manifest.filename !== 'string' ||
    typeof manifest.format !== 'string' ||
    typeof manifest.runtime !== 'string'
  ) {
    throw new Error(`Model manifest is malformed: ${manifestPath}`)
  }
  return manifest as ModelManifest
}

export interface ModelResolutionDirs {
  /** Managed model directory (for example %LOCALAPPDATA%/SpotlightTodo/models). */
  managedModelsDir: string
  /** Explicit configured model file path, if any. */
  explicitModelPath?: string | null
}

/**
 * Resolution order: explicit configured path -> managed application model
 * directory -> missing. Never scans the machine for GGUF files and never
 * accepts renderer-provided paths (the renderer cannot reach this code).
 */
export function resolveModelFile(
  manifest: ModelManifest,
  dirs: ModelResolutionDirs
): ResolvedModel {
  const explicit = (dirs.explicitModelPath ?? '').trim()
  if (explicit && existsSync(explicit)) {
    return { manifest, path: explicit, source: 'explicit' }
  }
  const managed = join(dirs.managedModelsDir, manifest.filename)
  if (managed && existsSync(managed)) {
    return { manifest, path: managed, source: 'managed' }
  }
  return { manifest, path: null, source: 'missing' }
}

/** Default managed model directory under the resolved app data directory. */
export function defaultManagedModelsDir(appDataDir: string): string {
  return join(appDataDir, AI_CONFIG.modelsSubdirectory)
}

/** Explicit model path from the environment override. Null when unset. */
export function explicitModelPathFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = (env[AI_CONFIG.modelPathEnvVar] ?? '').trim()
  return value.length > 0 ? value : null
}
