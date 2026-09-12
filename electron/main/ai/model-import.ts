import { createReadStream, createWriteStream, statSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { loadModelManifest, type ModelManifest } from './model-resolver'
import { validateModelFile } from './model-validator'

export interface ModelImportDirs {
  /** Directory containing model-manifest.json (packaged resources or repo resources). */
  resourcesDir: string
  /** Managed model directory (data dir/models). Created when missing. */
  managedModelsDir: string
}

export interface ImportedModel {
  manifest: ModelManifest
  /** Absolute destination path inside the managed model directory. */
  destination: string
}

export interface ImportProgress {
  bytesCopied: number
  totalBytes: number
}

/** Minimum interval between progress callbacks (renderer batching). */
export const IMPORT_PROGRESS_INTERVAL_MS = 250

/**
 * Native GGUF import core. Validates the selected file, streams it into the
 * managed model directory through a temporary partial file, then revalidates
 * the final artifact (exact manifest filename). Progress is throttled.
 * Cancellation or failure removes the partial file, so no apparently valid
 * partial model can remain. The final GGUF validation stays authoritative.
 */
export async function importModelFile(
  sourcePath: string,
  dirs: ModelImportDirs,
  events?: {
    signal?: AbortSignal
    onProgress?: (progress: ImportProgress) => void
  }
): Promise<ImportedModel> {
  const manifest = loadModelManifest(join(dirs.resourcesDir, 'ai', 'model-manifest.json'))
  const sourceName = sourcePath.split(/[/\\]/).pop() ?? ''
  const sourceCheck = await validateModelFile({ ...manifest, filename: sourceName }, sourcePath)
  if (!sourceCheck.ok && sourceCheck.code !== 'AI_MODEL_UNSUPPORTED') {
    throw codedError(sourceCheck.code, `Model selection failed: ${sourceCheck.code}`)
  }
  await mkdir(dirs.managedModelsDir, { recursive: true })
  const destination = join(dirs.managedModelsDir, manifest.filename)
  // Idempotent re-import: a valid managed copy is reused, never recopied.
  const existing = await validateModelFile(manifest, destination).catch(() => null)
  if (existing && existing.ok) return { manifest, destination }
  const partial = `${destination}.partial`
  try {
    await streamCopy(sourcePath, partial, events)
    await rename(partial, destination)
  } catch (error) {
    await rm(partial, { force: true }).catch(() => undefined)
    throw error
  }
  const finalCheck = await validateModelFile(manifest, destination)
  if (!finalCheck.ok) {
    throw codedError(finalCheck.code, `Model validation failed: ${finalCheck.code}`)
  }
  return { manifest, destination }
}

function codedError(code: string, message: string): Error {
  const error = new Error(message)
  ;(error as { code?: string }).code = code
  return error
}

/** Streamed copy with throttled progress and abort support. */
function streamCopy(
  source: string,
  destination: string,
  events?: { signal?: AbortSignal; onProgress?: (progress: ImportProgress) => void }
): Promise<void> {
  return new Promise((resolve, reject) => {
    let totalBytes = 0
    try {
      totalBytes = statSync(source).size
    } catch (error) {
      reject(error)
      return
    }
    if (events?.signal?.aborted) {
      reject(codedError('AI_GENERATION_CANCELLED', 'Model import was cancelled.'))
      return
    }
    let bytesCopied = 0
    let lastEmit = 0
    const emit = (force: boolean): void => {
      const now = Date.now()
      if (events?.onProgress && (force || now - lastEmit >= IMPORT_PROGRESS_INTERVAL_MS)) {
        lastEmit = now
        events.onProgress({ bytesCopied, totalBytes })
      }
    }
    const reader = createReadStream(source)
    const writer = createWriteStream(destination)
    const onAbort = (): void => {
      reader.destroy(codedError('AI_GENERATION_CANCELLED', 'Model import was cancelled.'))
    }
    events?.signal?.addEventListener('abort', onAbort, { once: true })
    const done = (error?: Error): void => {
      events?.signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else {
        emit(true)
        resolve()
      }
    }
    reader.on('data', (chunk: Buffer | string) => {
      bytesCopied += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
      emit(false)
    })
    reader.on('error', (error: Error) => {
      writer.destroy()
      done(error)
    })
    writer.on('error', (error: Error) => {
      reader.destroy()
      done(error)
    })
    writer.on('finish', () => done())
    reader.pipe(writer)
  })
}
