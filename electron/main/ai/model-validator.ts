import { createHash } from 'node:crypto'
import { createReadStream, statSync } from 'node:fs'
import { AiError } from './ai-errors'
import type { ModelManifest } from './model-resolver'

export type ModelValidation =
  | { ok: true; path: string }
  | {
      ok: false
      code:
        | 'AI_MODEL_NOT_FOUND'
        | 'AI_MODEL_INVALID'
        | 'AI_MODEL_HASH_MISMATCH'
        | 'AI_MODEL_UNSUPPORTED'
    }

/**
 * Validates a model file before inference: existence, regular file, GGUF
 * extension, reasonable size, manifest filename match, and optional SHA-256.
 * Returns a machine-readable result; callers map it to AiError/UX states.
 */
export async function validateModelFile(
  manifest: ModelManifest,
  modelPath: string | null
): Promise<ModelValidation> {
  if (!modelPath) return { ok: false, code: 'AI_MODEL_NOT_FOUND' }

  let stats: ReturnType<typeof statSync>
  try {
    stats = statSync(modelPath)
  } catch {
    return { ok: false, code: 'AI_MODEL_NOT_FOUND' }
  }
  if (!stats.isFile()) return { ok: false, code: 'AI_MODEL_INVALID' }
  if (!modelPath.toLowerCase().endsWith('.gguf')) return { ok: false, code: 'AI_MODEL_INVALID' }

  const base = modelPath.split(/[/\\]/).pop() ?? ''
  if (base !== manifest.filename) return { ok: false, code: 'AI_MODEL_UNSUPPORTED' }
  if (
    !Number.isSafeInteger(stats.size) ||
    stats.size < manifest.minimumFileBytes ||
    stats.size > manifest.maximumFileBytes
  ) {
    return { ok: false, code: 'AI_MODEL_INVALID' }
  }

  if (manifest.verifySha256 && typeof manifest.sha256 === 'string' && manifest.sha256.length > 0) {
    const actual = await sha256File(modelPath)
    if (actual.toLowerCase() !== manifest.sha256.toLowerCase()) {
      return { ok: false, code: 'AI_MODEL_HASH_MISMATCH' }
    }
  }

  return { ok: true, path: modelPath }
}

/** Throws AiError for an invalid model so service code stays linear. */
export async function assertValidModel(
  manifest: ModelManifest,
  modelPath: string | null
): Promise<string> {
  const result = await validateModelFile(manifest, modelPath)
  if (!result.ok) {
    throw new AiError(result.code, `Model validation failed: ${result.code}`)
  }
  return result.path
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}
