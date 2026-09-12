import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validateIpcArguments } from '../electron/main/ipc/security'
import { IPC } from '../electron/shared/ipc-channels'
import { AiRuntimeService } from '../electron/main/ai/ai-runtime.service'
import { importModelFile } from '../electron/main/ai/model-import'
import type { AiDb } from '../electron/main/ai/ai-session-manager'
import type { AiChatRequest } from '../electron/shared/types'

/**
 * REAL-MODEL QUALIFICATION. Skipped unless SPOTLIGHT_TODO_REAL_MODEL=1 with:
 * - resources/ai/runtime/llama-server.exe provisioned (official b10909 CPU build)
 * - %LOCALAPPDATA%/SpotlightTodo/staging/gemma-4-12B-it-Q4_K_M.gguf downloaded
 * Never runs inside the default `npm test` gate.
 */
const ENABLED = process.env.SPOTLIGHT_TODO_REAL_MODEL === '1'
const describeReal = ENABLED ? describe : describe.skip

const REPO_ROOT = process.cwd()
const RESOURCES_DIR = join(REPO_ROOT, 'resources')
const RUNTIME_EXE = join(RESOURCES_DIR, 'ai', 'runtime', 'llama-server.exe')
const LOCAL_APP_DATA = process.env.LOCALAPPDATA ?? join(tmpdir(), 'localappdata-fallback')
const STAGING_MODEL = join(LOCAL_APP_DATA, 'SpotlightTodo', 'staging', 'gemma-4-12B-it-Q4_K_M.gguf')
const QUAL_DATA = process.env.SPOTLIGHT_TODO_QUAL_DATA ?? join(LOCAL_APP_DATA, 'SpotlightTodo-qual')
const QUAL_MODELS = join(QUAL_DATA, 'models')

/** Shared in-memory store so a second service instance observes persisted history. */
function createSharedMemoryDb(): AiDb {
  const conversations = new Map<string, { id: string; title: string }>()
  const messages: Array<{ id: string; conversation_id: string; role: string; content: string }> = []
  const now = '2026-09-11 00:00:00'
  return {
    prepare(sql: string) {
      if (sql.startsWith('INSERT INTO ai_conversations')) {
        return {
          get: () => undefined,
          all: () => [],
          run: (id: string, title: string) => {
            conversations.set(id, { id, title })
            return { changes: 1 }
          }
        }
      }
      if (sql.startsWith('SELECT id, title')) {
        return {
          get: (id: string) => {
            const row = conversations.get(id)
            return row
              ? { id: row.id, title: row.title, created_at: now, updated_at: now }
              : undefined
          },
          all: (limit: number) =>
            [...conversations.values()]
              .slice(0, limit)
              .map((row) => ({ id: row.id, title: row.title, created_at: now, updated_at: now })),
          run: () => ({ changes: 0 })
        }
      }
      if (sql.startsWith('DELETE FROM ai_messages')) {
        return {
          get: () => undefined,
          all: () => [],
          run: (id: string) => {
            let changes = 0
            for (let index = messages.length - 1; index >= 0; index -= 1) {
              if (messages[index].conversation_id === id) {
                messages.splice(index, 1)
                changes += 1
              }
            }
            return { changes }
          }
        }
      }
      if (sql.startsWith('DELETE FROM ai_conversations')) {
        return {
          get: () => undefined,
          all: () => [],
          run: (id: string) => ({ changes: conversations.delete(id) ? 1 : 0 })
        }
      }
      if (sql.startsWith('INSERT INTO ai_messages')) {
        return {
          get: () => undefined,
          all: () => [],
          run: (id: string, conversationId: string, role: string, content: string) => {
            messages.push({ id, conversation_id: conversationId, role, content })
            return { changes: 1 }
          }
        }
      }
      if (sql.startsWith('UPDATE ai_conversations')) {
        return {
          get: () => undefined,
          all: () => [],
          run: () => ({ changes: 1 })
        }
      }
      if (sql.startsWith('SELECT id, conversation_id')) {
        return {
          get: (id: string) => {
            const row = messages.find((message) => message.id === id)
            return row ? { ...row, created_at: now } : undefined
          },
          all: (conversationId: string, limit: number) =>
            messages
              .filter((message) => message.conversation_id === conversationId)
              .slice(0, limit)
              .map((row) => ({ ...row, created_at: now })),
          run: () => ({ changes: 0 })
        }
      }
      throw new Error(`Unexpected SQL in qual fake: ${sql}`)
    }
  }
}

const sharedDb = createSharedMemoryDb()

function makeService(env: NodeJS.ProcessEnv = process.env): AiRuntimeService {
  const scrubbed = { ...env }
  delete scrubbed.SPOTLIGHT_TODO_MODEL_PATH
  return new AiRuntimeService({
    appDataDir: QUAL_DATA,
    resourcesDir: RESOURCES_DIR,
    getDb: () => sharedDb,
    env: scrubbed
  })
}

interface GenResult {
  text: string
  /** Visible content callbacks. Gemma emits extensive reasoning_content deltas
   * that the client deliberately ignores, so this undercounts raw decode
   * throughput (see llama-bench for authoritative tok/s). */
  contentCallbacks: number
  firstVisibleTokenMs: number | null
  totalMs: number
}

async function generate(
  service: AiRuntimeService,
  request: AiChatRequest,
  signal?: AbortSignal
): Promise<GenResult> {
  const started = Date.now()
  let contentCallbacks = 0
  let firstVisibleTokenMs: number | null = null
  const controller = new AbortController()
  const onAbort = (): void => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const text = await service.generate(
      request,
      {
        onToken: () => {
          contentCallbacks += 1
          if (firstVisibleTokenMs === null) firstVisibleTokenMs = Date.now() - started
        }
      },
      controller.signal
    )
    return { text, contentCallbacks, firstVisibleTokenMs, totalMs: Date.now() - started }
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

/** PIDs of llama-server processes serving the qualification model file. */
function qualServerPids(): number[] {
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" | Where-Object { $_.CommandLine -like '*gemma-4-12b-it-Q4_K_M.gguf*' } | Select-Object -ExpandProperty ProcessId`
      ],
      { encoding: 'utf8', timeout: 15000 }
    )
    return output
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isSafeInteger(pid))
  } catch {
    return []
  }
}

function workingSetMb(pid: number): number | null {
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Process -Id ${pid} -ErrorAction Stop).WorkingSet64`
      ],
      { encoding: 'utf8', timeout: 15000 }
    )
    return Math.round(Number.parseInt(output.trim(), 10) / 1024 / 1024)
  } catch {
    return null
  }
}

let service: AiRuntimeService
let conversationId: string
const measurements: Record<string, number | string> = {}

describeReal('AI real-model qualification (Gemma 4 12B Q4_K_M, llama-server b10909)', () => {
  beforeAll(async () => {
    expect(existsSync(RUNTIME_EXE), `missing runtime artifact: ${RUNTIME_EXE}`).toBe(true)
    expect(existsSync(STAGING_MODEL), `missing model artifact: ${STAGING_MODEL}`).toBe(true)
    const imported = await importModelFile(STAGING_MODEL, {
      resourcesDir: RESOURCES_DIR,
      managedModelsDir: QUAL_MODELS
    })
    measurements.modelBytes = (
      await import('node:fs/promises').then((fs) => fs.stat(imported.destination))
    ).size
    service = makeService()
    const coldStart = Date.now()
    const status = await service.ensureReady()
    measurements.coldStartMs = Date.now() - coldStart
    expect(status.state).toBe('ready')
    expect(qualServerPids().length).toBeGreaterThan(0)
    const created = service.createConversation('Qualification')
    conversationId = created.id
  }, 600_000)

  afterAll(async () => {
    const shutdownStart = Date.now()
    await service?.shutdown()
    measurements.shutdownMs = Date.now() - shutdownStart
    await new Promise((resolve) => setTimeout(resolve, 2000))
    expect(qualServerPids()).toEqual([])
    // eslint-disable-next-line no-console
    console.log(`AI_QUAL_MEASUREMENTS ${JSON.stringify(measurements)}`)
  }, 120_000)

  it('answers a short prompt with the exact marker', async () => {
    const result = await generate(service, {
      requestId: 'qual-short',
      conversationId,
      messages: [{ id: 'm1', role: 'user', content: 'Reply with exactly: LOCAL_AI_OK' }]
    })
    expect(result.text).toContain('LOCAL_AI_OK')
    expect(result.contentCallbacks).toBeGreaterThan(0)
    measurements.shortContentCallbacksPerSec = Number(
      ((result.contentCallbacks / result.totalMs) * 1000).toFixed(2)
    )
    measurements.shortFirstVisibleTokenMs = result.firstVisibleTokenMs ?? -1
  }, 300_000)

  it('streams tokens incrementally', async () => {
    let callbacks = 0
    const controller = new AbortController()
    await service.generate(
      {
        requestId: 'qual-stream',
        conversationId,
        messages: [{ id: 'm1', role: 'user', content: 'Count from one to five, one per line.' }]
      },
      {
        onToken: () => {
          callbacks += 1
        }
      },
      controller.signal
    )
    expect(callbacks).toBeGreaterThan(1)
  }, 300_000)

  it('holds a multi-turn conversation', async () => {
    const first = await generate(service, {
      requestId: 'qual-turn1',
      conversationId,
      messages: [
        { id: 'm1', role: 'user', content: 'My favorite color is teal. Say it back briefly.' }
      ]
    })
    expect(first.text.toLowerCase()).toContain('teal')
    const second = await generate(service, {
      requestId: 'qual-turn2',
      conversationId,
      messages: [
        { id: 'm1', role: 'user', content: 'My favorite color is teal. Say it back briefly.' },
        { id: 'm2', role: 'assistant', content: first.text },
        { id: 'm3', role: 'user', content: 'What color did I mention?' }
      ]
    })
    expect(second.text.toLowerCase()).toContain('teal')
    measurements.mediumContentCallbacksPerSec = Number(
      ((second.contentCallbacks / second.totalMs) * 1000).toFixed(2)
    )
  }, 300_000)

  it('handles Unicode and non-English input', async () => {
    const result = await generate(service, {
      requestId: 'qual-unicode',
      conversationId,
      messages: [{ id: 'm1', role: 'user', content: 'ما هو لون السماء؟ أجب بجملة واحدة.' }]
    })
    expect(result.text.trim().length).toBeGreaterThan(0)
  }, 300_000)

  it('returns Markdown with a code block on request', async () => {
    const result = await generate(service, {
      requestId: 'qual-markdown',
      conversationId,
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Show a tiny TypeScript function in a fenced code block.'
        }
      ]
    })
    expect(result.text).toContain('```')
  }, 300_000)

  it('accepts a long prompt near configured limits', async () => {
    const longText = `Background: ${'Dependency injection decouples construction from use. '.repeat(140)} Question: reply with exactly LONG_OK.`
    expect(longText.length).toBeLessThan(8000)
    const result = await generate(service, {
      requestId: 'qual-long',
      conversationId,
      messages: [{ id: 'm1', role: 'user', content: longText }]
    })
    expect(result.text).toContain('LONG_OK')
    measurements.longContentCallbacksPerSec = Number(
      ((result.contentCallbacks / result.totalMs) * 1000).toFixed(2)
    )
    const pids = qualServerPids()
    expect(pids.length).toBeGreaterThan(0)
    measurements.modelLoadedRamMb = workingSetMb(pids[0]) ?? -1
  }, 300_000)

  it('cancels generation without unloading the model', async () => {
    const controller = new AbortController()
    const pending = generate(
      service,
      {
        requestId: 'qual-cancel',
        conversationId,
        messages: [
          {
            id: 'm1',
            role: 'user',
            content: 'Write a very long story about a lighthouse, at least a thousand words.'
          }
        ]
      },
      controller.signal
    )
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const cancelStart = Date.now()
    controller.abort()
    service.cancel('qual-cancel')
    await expect(pending).rejects.toMatchObject({ code: 'AI_GENERATION_CANCELLED' })
    measurements.cancelLatencyMs = Date.now() - cancelStart
    expect(service.getStatus().state).toBe('ready')
    expect(qualServerPids().length).toBeGreaterThan(0)
  }, 300_000)

  it('serves an immediate second request after cancellation', async () => {
    const result = await generate(service, {
      requestId: 'qual-after-cancel',
      conversationId,
      messages: [{ id: 'm1', role: 'user', content: 'Reply with exactly: AFTER_CANCEL_OK' }]
    })
    expect(result.text).toContain('AFTER_CANCEL_OK')
  }, 300_000)

  it('enforces the single-generation policy', async () => {
    const controller = new AbortController()
    const first = generate(
      service,
      {
        requestId: 'qual-busy-1',
        conversationId,
        messages: [{ id: 'm1', role: 'user', content: 'Write a long essay about oceans.' }]
      },
      controller.signal
    )
    await expect(
      generate(service, {
        requestId: 'qual-busy-2',
        conversationId,
        messages: [{ id: 'm1', role: 'user', content: 'Second request.' }]
      })
    ).rejects.toMatchObject({ code: 'AI_BUSY' })
    controller.abort()
    service.cancel('qual-busy-1')
    await expect(first).rejects.toMatchObject({ code: 'AI_GENERATION_CANCELLED' })
  }, 300_000)

  it('reloads persisted history in a restarted service', async () => {
    const restarted = makeService()
    const status = await restarted.ensureReady()
    expect(status.state).toBe('ready')
    const history = restarted.listMessages(conversationId)
    expect(history.length).toBeGreaterThan(0)
    expect(history.some((message) => message.content.includes('LOCAL_AI_OK'))).toBe(true)
    await restarted.shutdown()
  }, 300_000)

  it('deletes conversations with cascade', async () => {
    const transient = service.createConversation('Transient')
    await generate(service, {
      requestId: 'qual-delete',
      conversationId: transient.id,
      messages: [{ id: 'm1', role: 'user', content: 'Reply with exactly: DELETE_OK' }]
    })
    expect(service.deleteConversation(transient.id)).toBe(true)
    expect(service.listMessages(transient.id)).toEqual([])
  }, 300_000)

  it('rejects malformed IPC without touching the runtime', () => {
    expect(() =>
      validateIpcArguments(IPC.AI_CHAT_START, [
        { requestId: 'x', messages: [{ id: 'm', role: 'hacker', content: 'x' }] }
      ])
    ).toThrow(/role/i)
  })

  it('reports runtime-unavailable when the executable is missing', async () => {
    const emptyResources = join(tmpdir(), 'ai-qual-no-runtime')
    mkdirSync(join(emptyResources, 'ai'), { recursive: true })
    // A valid manifest but no runtime executable on disk.
    copyFileSync(
      join(RESOURCES_DIR, 'ai', 'model-manifest.json'),
      join(emptyResources, 'ai', 'model-manifest.json')
    )
    const broken = new AiRuntimeService({
      appDataDir: QUAL_DATA,
      resourcesDir: emptyResources,
      getDb: () => sharedDb,
      env: { ...process.env, SPOTLIGHT_TODO_LLAMA_SERVER: 'C:\\absent\\llama-server.exe' }
    })
    const status = await broken.ensureReady()
    expect(status.state).toBe('error')
    expect(status.errorCode).toBe('AI_RUNTIME_NOT_FOUND')
  }, 120_000)

  it('reports model-unavailable when no model is installed', async () => {
    const empty = new AiRuntimeService({
      appDataDir: join(tmpdir(), 'ai-qual-empty-models'),
      resourcesDir: RESOURCES_DIR,
      getDb: () => sharedDb,
      env: { ...process.env, SPOTLIGHT_TODO_MODEL_PATH: '' }
    })
    const status = await empty.ensureReady()
    expect(status.state).toBe('error')
    expect(status.errorCode).toBe('AI_MODEL_NOT_FOUND')
  }, 120_000)

  it('recovers after the server terminates mid-generation', async () => {
    const controller = new AbortController()
    const pending = generate(
      service,
      {
        requestId: 'qual-crash',
        conversationId,
        messages: [{ id: 'm1', role: 'user', content: 'Write a long essay about deserts.' }]
      },
      controller.signal
    )
    await new Promise((resolve) => setTimeout(resolve, 5000))
    for (const pid of qualServerPids()) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
    await expect(pending).rejects.toBeDefined()
    expect(['error', 'ready']).toContain(service.getStatus().state)
    const recovered = await service.ensureReady()
    expect(recovered.state).toBe('ready')
    controller.abort()
  }, 300_000)
})
