import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AiError } from '../electron/main/ai/ai-errors'
import { AiRuntimeService } from '../electron/main/ai/ai-runtime.service'
import { isLowMemoryHost } from '../electron/main/ai/ai-config'
import type { LlamaClient } from '../electron/main/ai/llama-client'
import type {
  LlamaProcessManager,
  LlamaServerHandle
} from '../electron/main/ai/llama-process-manager'
import type { GenerateEvents } from '../electron/main/ai/ai-provider'
import type { AiChatRequest } from '../electron/shared/types'

/**
 * Generation-phase UX (Preparing → Thinking → Responding) without a real
 * model: a test-local manifest plus injected process/client fakes keep the
 * suite hermetic and fast. Reasoning content is never involved — only the
 * phase transitions the UI is allowed to display.
 */
const needsRam = isLowMemoryHost() ? describe.skip : describe

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

interface Fixture {
  service: AiRuntimeService
  releaseStart: () => void
  started: Promise<LlamaServerHandle>
  chatGate: ReturnType<typeof deferred<string>>
  emitToken: (text: string) => void
  cleanup: () => void
}

function makeService(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'ai-phase-'))
  // Test-local manifest with byte-scale bounds so no multi-GB fixture file is
  // needed; production bounds in resources/ai/model-manifest.json are untouched.
  const resourcesDir = join(dir, 'resources')
  mkdirSync(join(resourcesDir, 'ai'), { recursive: true })
  writeFileSync(
    join(resourcesDir, 'ai', 'model-manifest.json'),
    JSON.stringify({
      id: 'phase-test-model',
      name: 'Phase Test',
      family: 'test',
      format: 'gguf',
      quantization: 'Q4_K_M',
      filename: 'phase-test.gguf',
      sha256: null,
      verifySha256: false,
      minimumFileBytes: 1,
      maximumFileBytes: 1024,
      minimumRamGb: 0,
      recommendedRamGb: 0,
      runtime: 'llama.cpp',
      runtimeMinimumVersion: 'b5000'
    })
  )
  const modelPath = join(dir, 'phase-test.gguf')
  writeFileSync(modelPath, 'tiny-gguf-stand-in')
  // Runtime-executable stub: resolveRuntimeExecutable only checks existence,
  // and the injected fake process manager never spawns it, so the suite stays
  // hermetic with no provisioned llama.cpp build required.
  const runtimeDir = join(resourcesDir, 'ai', 'runtime')
  mkdirSync(runtimeDir, { recursive: true })
  writeFileSync(join(runtimeDir, 'llama-server.exe'), 'phase-test-stub')

  const startGate = deferred<LlamaServerHandle>()
  const chatGate = deferred<string>()
  let capturedOnToken: ((text: string) => void) | null = null

  const processes = {
    isRunning: (): boolean => true,
    getHandle: (): LlamaServerHandle => ({ baseUrl: 'http://127.0.0.1:9', port: 9, pid: 1 }),
    start: (): Promise<LlamaServerHandle> => startGate.promise,
    stop: (): Promise<void> => Promise.resolve()
  }
  const client = {
    chat: (options: { signal: AbortSignal; onToken: (text: string) => void }): Promise<string> => {
      capturedOnToken = options.onToken
      options.signal.addEventListener(
        'abort',
        () => chatGate.reject(new AiError('AI_GENERATION_CANCELLED', 'Generation was cancelled.')),
        { once: true }
      )
      return chatGate.promise
    }
  }
  const service = new AiRuntimeService(
    {
      appDataDir: join(dir, 'data'),
      resourcesDir,
      getDb: () => {
        throw new Error('phase tests never persist (no conversationId)')
      },
      env: { ...process.env, SPOTLIGHT_TODO_MODEL_PATH: modelPath }
    },
    processes as unknown as LlamaProcessManager,
    client as unknown as LlamaClient
  )
  return {
    service,
    releaseStart: () => startGate.resolve({ baseUrl: 'http://127.0.0.1:9', port: 9, pid: 1 }),
    started: startGate.promise,
    chatGate,
    emitToken: (text: string): void => {
      if (!capturedOnToken) throw new Error('client.chat was not reached')
      capturedOnToken(text)
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  }
}

async function pollFor(check: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
  const started = Date.now()
  for (;;) {
    if (check()) return
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function chatRequest(id: string): AiChatRequest {
  return {
    requestId: id,
    messages: [{ id: 'm1', role: 'user', content: 'Hello' }]
  }
}

function generateEvents(): { events: GenerateEvents; seen: string[] } {
  const seen: string[] = []
  return { events: { onToken: (text: string): void => void seen.push(text) }, seen }
}

needsRam('AI generation phase (preparing → thinking → responding)', () => {
  const fixtures: Fixture[] = []
  afterEach(() => {
    for (const fixture of fixtures.splice(0)) fixture.cleanup()
  })

  it('reports preparing while the runtime starts and clears it when ready', async () => {
    const fixture = makeService()
    fixtures.push(fixture)
    const ready = fixture.service.ensureReady()
    await pollFor(() => fixture.service.getStatus().phase === 'preparing', 'preparing phase')
    expect(['starting', 'loading']).toContain(fixture.service.getStatus().state)
    fixture.releaseStart()
    await expect(ready).resolves.toMatchObject({ state: 'ready' })
    expect(fixture.service.getStatus().phase).toBeUndefined()
  })

  it('moves thinking → responding on the first visible token, then clears', async () => {
    const fixture = makeService()
    fixtures.push(fixture)
    const ready = fixture.service.ensureReady()
    fixture.releaseStart()
    await ready
    const { events, seen } = generateEvents()
    const pending = fixture.service.generate(
      chatRequest('phase-1'),
      events,
      new AbortController().signal
    )
    await pollFor(() => fixture.service.getStatus().phase === 'thinking', 'thinking phase')
    expect(fixture.service.getStatus().state).toBe('generating')
    fixture.emitToken('hi')
    await pollFor(() => fixture.service.getStatus().phase === 'responding', 'responding phase')
    expect(seen).toEqual(['hi'])
    fixture.chatGate.resolve('hi')
    await expect(pending).resolves.toBe('hi')
    expect(fixture.service.getStatus()).toMatchObject({ state: 'ready' })
    expect(fixture.service.getStatus().phase).toBeUndefined()
  })

  it('clears the phase when generation fails', async () => {
    const fixture = makeService()
    fixtures.push(fixture)
    const ready = fixture.service.ensureReady()
    fixture.releaseStart()
    await ready
    const pending = fixture.service.generate(
      chatRequest('phase-2'),
      generateEvents().events,
      new AbortController().signal
    )
    await pollFor(() => fixture.service.getStatus().phase === 'thinking', 'thinking phase')
    fixture.chatGate.reject(new AiError('AI_GENERATION_FAILED', 'boom'))
    await expect(pending).rejects.toMatchObject({ code: 'AI_GENERATION_FAILED' })
    expect(fixture.service.getStatus()).toMatchObject({ state: 'ready' })
    expect(fixture.service.getStatus().phase).toBeUndefined()
  })

  it('clears the phase when generation is cancelled mid-thinking', async () => {
    const fixture = makeService()
    fixtures.push(fixture)
    const ready = fixture.service.ensureReady()
    fixture.releaseStart()
    await ready
    const pending = fixture.service.generate(
      chatRequest('phase-3'),
      generateEvents().events,
      new AbortController().signal
    )
    await pollFor(() => fixture.service.getStatus().phase === 'thinking', 'thinking phase')
    fixture.service.cancel('phase-3')
    await expect(pending).rejects.toMatchObject({ code: 'AI_GENERATION_CANCELLED' })
    expect(fixture.service.getStatus()).toMatchObject({ state: 'ready' })
    expect(fixture.service.getStatus().phase).toBeUndefined()
  })
})
