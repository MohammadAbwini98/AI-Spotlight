import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AiChatRequest,
  AiConversation,
  AiConversationMessage,
  AiModelInfo,
  AiRuntimeStatus
} from '../../shared/types'
import { AI_CONFIG, isLowMemoryHost, resolveAiThreadCount } from './ai-config'
import { AiError } from './ai-errors'
import type { AiProvider, GenerateEvents } from './ai-provider'
import { LlamaClient } from './llama-client'
import { LlamaProcessManager } from './llama-process-manager'
import { AiSessionManager, type AiDb } from './ai-session-manager'
import { assertValidModel, validateModelFile } from './model-validator'
import {
  defaultManagedModelsDir,
  explicitModelPathFromEnv,
  loadModelManifest,
  resolveModelFile,
  type ModelManifest
} from './model-resolver'

export interface AiRuntimeDependencies {
  /** Resolved app data directory (for example %LOCALAPPDATA%/SpotlightTodo). */
  appDataDir: string
  /** Packaged resources directory (process.resourcesPath) or repo resources dir in dev. */
  resourcesDir: string
  /** Database accessor. Called lazily so search/sync never load AI code paths. */
  getDb: () => AiDb
  env?: NodeJS.ProcessEnv
}

/**
 * High-level local-AI lifecycle owner (production LlamaCppProvider).
 * Coordinates resolver/validator/process/client/session; contains no IPC or
 * renderer code. Lazy: nothing starts until ensureReady() after explicit AI
 * interaction. Single concurrent generation (CPU-only policy).
 */
export class AiRuntimeService implements AiProvider {
  private status: AiRuntimeStatus = { state: 'stopped' }
  private manifest: ModelManifest | null = null
  private activeRequestId: string | null = null
  private activeAbort: AbortController | null = null
  private ensureInFlight: Promise<AiRuntimeStatus> | null = null
  private sessions: AiSessionManager | null = null

  constructor(
    private readonly deps: AiRuntimeDependencies,
    private readonly processes = new LlamaProcessManager(),
    private readonly client = new LlamaClient()
  ) {}

  getStatus(): AiRuntimeStatus {
    if (this.status.state === 'ready' && !this.processes.isRunning()) {
      return {
        ...this.status,
        state: 'error',
        errorCode: 'AI_SERVER_UNAVAILABLE',
        error: 'AI runtime stopped unexpectedly.'
      }
    }
    return { ...this.status }
  }

  /** Idempotent startup. Concurrent callers share one startup sequence. */
  ensureReady(): Promise<AiRuntimeStatus> {
    if (this.status.state === 'ready' && this.processes.isRunning()) {
      return Promise.resolve(this.getStatus())
    }
    if (!this.ensureInFlight) {
      this.ensureInFlight = this.start().finally(() => {
        this.ensureInFlight = null
      })
    }
    return this.ensureInFlight
  }

  async generate(
    request: AiChatRequest,
    events: GenerateEvents,
    signal: AbortSignal
  ): Promise<string> {
    // Reserve synchronously: the BUSY check must be atomic across the awaits
    // below, otherwise two same-tick callers could both start generating.
    if (this.activeRequestId) {
      throw new AiError('AI_BUSY', 'The AI is already generating a response.')
    }
    this.activeRequestId = request.requestId
    let status: AiRuntimeStatus
    try {
      status = await this.ensureReady()
    } catch (error) {
      this.activeRequestId = null
      throw error
    }
    if (status.state !== 'ready') {
      this.activeRequestId = null
      throw new AiError(status.errorCode ?? 'AI_NOT_READY', status.error ?? 'AI is not ready.')
    }
    const handle = this.processes.getHandle()
    if (!handle) {
      this.activeRequestId = null
      throw new AiError('AI_SERVER_UNAVAILABLE', 'AI server is unavailable.')
    }

    const abort = new AbortController()
    this.activeAbort = abort
    const onExternalAbort = (): void => abort.abort()
    if (signal.aborted) onExternalAbort()
    else signal.addEventListener('abort', onExternalAbort, { once: true })
    // Thinking until the first visible answer token arrives; hidden reasoning
    // is never exposed, only the phase. Responding flips on first onToken.
    this.status = { ...this.status, state: 'generating', phase: 'thinking' }

    try {
      let responding = false
      const text = await this.client.chat({
        baseUrl: handle.baseUrl,
        messages: request.messages,
        signal: abort.signal,
        onToken: (token) => {
          if (!responding) {
            responding = true
            this.status = { ...this.status, phase: 'responding' }
          }
          events.onToken(token)
        }
      })
      this.persistTurn(request, text)
      this.status = { ...this.status, state: 'ready', phase: undefined }
      return text
    } catch (error) {
      this.status = { ...this.status, state: 'ready', phase: undefined }
      if (error instanceof AiError) throw error
      throw new AiError('AI_GENERATION_FAILED', `Generation failed: ${String(error)}`)
    } finally {
      signal.removeEventListener('abort', onExternalAbort)
      this.activeRequestId = null
      this.activeAbort = null
    }
  }

  cancel(requestId: string): void {
    if (this.activeRequestId && this.activeRequestId === requestId) {
      this.activeAbort?.abort()
    }
  }

  /** Cancels generation, closes the stream, terminates llama-server. Bounded wait. */
  async shutdown(): Promise<void> {
    this.activeAbort?.abort()
    this.activeRequestId = null
    this.activeAbort = null
    await this.processes.stop()
    if (this.status.state !== 'error') this.status = { state: 'stopped' }
  }

  async getModelInfo(): Promise<AiModelInfo> {
    const manifest = this.loadManifest()
    const resolved = this.resolveModel(manifest)
    const validation = await validateModelFile(manifest, resolved.path)
    return {
      modelId: manifest.id,
      name: manifest.name,
      quantization: manifest.quantization,
      filename: manifest.filename,
      path: resolved.path,
      installed: resolved.path !== null,
      valid: validation.ok,
      runtime: manifest.runtime
    }
  }

  createConversation(title = 'New chat'): AiConversation {
    return this.sessionManager().createConversation(title)
  }

  listConversations(): AiConversation[] {
    return this.sessionManager().listConversations()
  }

  listMessages(conversationId: string): AiConversationMessage[] {
    return this.sessionManager().listMessages(conversationId)
  }

  deleteConversation(conversationId: string): boolean {
    return this.sessionManager().deleteConversation(conversationId)
  }

  private async start(): Promise<AiRuntimeStatus> {
    this.status = { state: 'starting', phase: 'preparing' }
    try {
      const manifest = this.loadManifest()
      const resolved = this.resolveModel(manifest)
      this.status = { ...this.status, state: 'loading', modelId: manifest.id, phase: 'preparing' }
      const modelPath = await assertValidModel(manifest, resolved.path)
      const executable = this.resolveRuntimeExecutable()
      if (isLowMemoryHost()) {
        throw new AiError('AI_OUT_OF_MEMORY', 'Not enough memory to load the model.')
      }
      await this.processes.start({
        executablePath: executable,
        modelPath,
        threads: resolveAiThreadCount(),
        contextSize: AI_CONFIG.contextSize,
        onExit: () => {
          if (this.status.state === 'ready' || this.status.state === 'generating') {
            this.status = {
              state: 'error',
              modelId: manifest.id,
              errorCode: 'AI_SERVER_UNAVAILABLE',
              error: 'AI runtime stopped unexpectedly.'
            }
          }
        }
      })
      this.status = { state: 'ready', modelId: manifest.id }
      return this.getStatus()
    } catch (error) {
      const code = error instanceof AiError ? error.code : ('AI_RUNTIME_START_FAILED' as const)
      this.status = { state: 'error', errorCode: code, error: String(error) }
      return this.getStatus()
    }
  }

  private loadManifest(): ModelManifest {
    if (!this.manifest) {
      this.manifest = loadModelManifest(join(this.deps.resourcesDir, 'ai', 'model-manifest.json'))
    }
    return this.manifest
  }

  private resolveModel(manifest: ModelManifest): { path: string | null } {
    const env = this.deps.env ?? process.env
    return resolveModelFile(manifest, {
      managedModelsDir: defaultManagedModelsDir(this.deps.appDataDir),
      explicitModelPath: explicitModelPathFromEnv(env)
    })
  }

  private resolveRuntimeExecutable(): string {
    const env = this.deps.env ?? process.env
    const override = (env[AI_CONFIG.runtimePathEnvVar] ?? '').trim()
    if (override && existsSync(override)) return override
    const packaged = join(this.deps.resourcesDir, 'ai', 'runtime', 'llama-server.exe')
    if (existsSync(packaged)) return packaged
    const dev = join(this.deps.resourcesDir, 'ai', 'runtime', 'llama-server.exe')
    if (existsSync(dev)) return dev
    throw new AiError('AI_RUNTIME_NOT_FOUND', 'llama-server executable was not found.')
  }

  private sessionManager(): AiSessionManager {
    if (!this.sessions) this.sessions = new AiSessionManager(this.deps.getDb())
    return this.sessions
  }

  private persistTurn(request: AiChatRequest, assistantText: string): void {
    const conversationId = request.conversationId
    if (!conversationId) return
    try {
      const sessions = this.sessionManager()
      if (!sessions.getConversation(conversationId)) return
      const lastUser = [...request.messages].reverse().find((message) => message.role === 'user')
      if (lastUser) {
        sessions.appendMessage(conversationId, 'user', lastUser.content)
        sessions.maybeTitleConversation(conversationId, lastUser.content)
      }
      sessions.appendMessage(conversationId, 'assistant', assistantText)
    } catch {
      // Persistence must never fail a completed generation.
    }
  }
}
