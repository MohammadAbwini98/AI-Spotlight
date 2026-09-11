import { app, dialog } from 'electron'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc-channels'
import type {
  AiChatRequest,
  AiCompletion,
  AiConversation,
  AiConversationMessage,
  AiModelInfo,
  AiRuntimeStatus,
  AiTokenDelta,
  ApiResult
} from '../../shared/types'
import { aiUserMessage } from '../ai/ai-errors'
import { AiRuntimeService } from '../ai/ai-runtime.service'
import { defaultManagedModelsDir, loadModelManifest } from '../ai/model-resolver'
import { validateModelFile } from '../ai/model-validator'
import { getDb } from '../db/database'
import { resolveDataPath } from '../storage/paths'
import { registerTrustedHandler } from './security'

let service: AiRuntimeService | null = null

function getService(): AiRuntimeService {
  if (!service) {
    service = new AiRuntimeService({
      appDataDir: resolveDataPath(),
      resourcesDir: app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'),
      getDb: () => getDb() as unknown as import('../ai/ai-session-manager').AiDb
    })
  }
  return service
}

/** Graceful AI shutdown for the application-quit lifecycle. */
export async function shutdownAi(): Promise<void> {
  if (service) await service.shutdown()
}

export function registerAiHandlers(): void {
  registerTrustedHandler(IPC.AI_GET_STATUS, (): ApiResult<AiRuntimeStatus> => {
    try {
      return { ok: true, data: getService().getStatus() }
    } catch (error) {
      return { ok: false, error: { code: 'AI_SERVER_UNAVAILABLE', message: String(error) } }
    }
  })

  registerTrustedHandler(IPC.AI_ENSURE_READY, async (): Promise<ApiResult<AiRuntimeStatus>> => {
    const status = await getService().ensureReady()
    if (status.state === 'ready') return { ok: true, data: status }
    return {
      ok: false,
      error: {
        code: status.errorCode ?? 'AI_NOT_READY',
        message: status.error ?? 'AI is not ready.'
      }
    }
  })

  registerTrustedHandler(
    IPC.AI_CHAT_START,
    async (event, request: AiChatRequest): Promise<ApiResult<{ requestId: string }>> => {
      const sender = event.sender
      const requestId = request.requestId
      const abort = new AbortController()
      activeGenerations.set(requestId, abort)

      let buffer = ''
      const flushTimer = setInterval(() => {
        if (buffer && !sender.isDestroyed()) {
          const delta: AiTokenDelta = { requestId, text: buffer }
          buffer = ''
          sender.send(IPC.AI_CHAT_DELTA, delta)
        }
      }, 40)
      flushTimer.unref?.()

      try {
        const text = await getService().generate(
          request,
          {
            onToken: (token) => {
              buffer += token
            }
          },
          abort.signal
        )
        if (buffer && !sender.isDestroyed()) {
          sender.send(IPC.AI_CHAT_DELTA, { requestId, text: buffer } as AiTokenDelta)
          buffer = ''
        }
        if (!sender.isDestroyed()) {
          const completion: AiCompletion = { requestId, finishReason: 'stop' }
          sender.send(IPC.AI_CHAT_COMPLETE, completion)
        }
        void text
        return { ok: true, data: { requestId } }
      } catch (error) {
        const code = toAiErrorCode(error)
        if (!sender.isDestroyed()) {
          sender.send(IPC.AI_CHAT_ERROR, {
            requestId,
            code,
            message: aiUserMessage(code)
          })
        }
        return {
          ok: false,
          error: {
            code,
            message: String(error)
          }
        }
      } finally {
        clearInterval(flushTimer)
        activeGenerations.delete(requestId)
      }
    }
  )

  registerTrustedHandler(IPC.AI_CHAT_CANCEL, (_event, requestId: string): ApiResult<void> => {
    activeGenerations.get(requestId)?.abort()
    getService().cancel(requestId)
    return { ok: true, data: undefined }
  })

  registerTrustedHandler(
    IPC.AI_NEW_CONVERSATION,
    (_event, title?: string): ApiResult<AiConversation> => {
      try {
        return { ok: true, data: getService().createConversation(title || 'New chat') }
      } catch (error) {
        return { ok: false, error: { code: 'AI_GENERATION_FAILED', message: String(error) } }
      }
    }
  )

  registerTrustedHandler(IPC.AI_GET_CONVERSATIONS, (): ApiResult<AiConversation[]> => {
    try {
      return { ok: true, data: getService().listConversations() }
    } catch (error) {
      return { ok: false, error: { code: 'AI_GENERATION_FAILED', message: String(error) } }
    }
  })

  registerTrustedHandler(
    IPC.AI_GET_MESSAGES,
    (_event, conversationId: string): ApiResult<AiConversationMessage[]> => {
      try {
        return { ok: true, data: getService().listMessages(conversationId) }
      } catch (error) {
        return { ok: false, error: { code: 'AI_GENERATION_FAILED', message: String(error) } }
      }
    }
  )

  registerTrustedHandler(
    IPC.AI_DELETE_CONVERSATION,
    (_event, conversationId: string): ApiResult<void> => {
      try {
        getService().deleteConversation(conversationId)
        return { ok: true, data: undefined }
      } catch (error) {
        return { ok: false, error: { code: 'AI_GENERATION_FAILED', message: String(error) } }
      }
    }
  )

  registerTrustedHandler(IPC.AI_GET_MODEL_INFO, async (): Promise<ApiResult<AiModelInfo>> => {
    try {
      return { ok: true, data: await getService().getModelInfo() }
    } catch (error) {
      return { ok: false, error: { code: 'AI_MODEL_INVALID', message: String(error) } }
    }
  })

  // Native trusted import: user picks a GGUF once, main validates and copies it
  // into the managed model directory with an async (non-blocking) copy.
  registerTrustedHandler(IPC.AI_SELECT_MODEL, async (): Promise<ApiResult<AiModelInfo>> => {
    try {
      const picked = await dialog.showOpenDialog({
        title: 'Select Gemma GGUF model',
        properties: ['openFile'],
        filters: [{ name: 'GGUF model', extensions: ['gguf'] }]
      })
      if (picked.canceled || picked.filePaths.length === 0) {
        return {
          ok: false,
          error: { code: 'AI_GENERATION_CANCELLED', message: 'Model selection was cancelled.' }
        }
      }
      const source = picked.filePaths[0]
      const resourcesDir = app.isPackaged
        ? process.resourcesPath
        : join(app.getAppPath(), 'resources')
      const manifest = loadModelManifest(join(resourcesDir, 'ai', 'model-manifest.json'))
      const managedDir = defaultManagedModelsDir(resolveDataPath())
      await mkdir(managedDir, { recursive: true })
      const destination = join(managedDir, manifest.filename)
      const sourceValidation = await validateModelFile(
        { ...manifest, filename: source.split(/[/\\]/).pop() ?? '' },
        source
      )
      if (!sourceValidation.ok && sourceValidation.code !== 'AI_MODEL_UNSUPPORTED') {
        return {
          ok: false,
          error: { code: sourceValidation.code, message: aiUserMessage(sourceValidation.code) }
        }
      }
      if (source !== destination) {
        await copyFile(source, destination)
      }
      const finalValidation = await validateModelFile(manifest, destination)
      if (!finalValidation.ok) {
        return {
          ok: false,
          error: { code: finalValidation.code, message: aiUserMessage(finalValidation.code) }
        }
      }
      return { ok: true, data: await getService().getModelInfo() }
    } catch (error) {
      return { ok: false, error: { code: 'AI_MODEL_INVALID', message: String(error) } }
    }
  })

  registerTrustedHandler(IPC.AI_SHUTDOWN, async (): Promise<ApiResult<void>> => {
    await getService().shutdown()
    return { ok: true, data: undefined }
  })
}

const activeGenerations = new Map<string, AbortController>()

const AI_ERROR_CODES = new Set([
  'AI_RUNTIME_NOT_FOUND',
  'AI_RUNTIME_START_FAILED',
  'AI_RUNTIME_TIMEOUT',
  'AI_MODEL_NOT_FOUND',
  'AI_MODEL_INVALID',
  'AI_MODEL_HASH_MISMATCH',
  'AI_MODEL_UNSUPPORTED',
  'AI_SERVER_UNAVAILABLE',
  'AI_GENERATION_FAILED',
  'AI_GENERATION_CANCELLED',
  'AI_REQUEST_TOO_LARGE',
  'AI_TOO_MANY_MESSAGES',
  'AI_BUSY',
  'AI_OUT_OF_MEMORY',
  'AI_NOT_READY'
])

/** Maps thrown failures to the structured AI error taxonomy. */
function toAiErrorCode(error: unknown): import('../../shared/types').AiErrorCode {
  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && AI_ERROR_CODES.has(code)) {
    return code as import('../../shared/types').AiErrorCode
  }
  return 'AI_GENERATION_FAILED'
}
