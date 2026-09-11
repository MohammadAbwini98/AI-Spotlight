import { AI_CONFIG } from './ai-config'
import { AiError } from './ai-errors'
import type { AiMessage } from '../../shared/types'

export interface LlamaChatOptions {
  baseUrl: string
  messages: AiMessage[]
  signal: AbortSignal
  onToken: (text: string) => void
}

/**
 * Minimal OpenAI-compatible client for the managed llama-server instance.
 * Communicates only with the process created by LlamaProcessManager over
 * 127.0.0.1. Parses SSE `data:` frames and forwards content deltas.
 */
export class LlamaClient {
  async chat(options: LlamaChatOptions): Promise<string> {
    let response: Response
    try {
      response = await fetch(`${options.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: options.messages.map((message) => ({
            role: message.role,
            content: message.content
          })),
          stream: true,
          temperature: AI_CONFIG.temperature,
          top_p: AI_CONFIG.topP,
          repeat_penalty: AI_CONFIG.repeatPenalty,
          max_tokens: AI_CONFIG.maxOutputTokens
        }),
        signal: options.signal
      })
    } catch (error) {
      if (options.signal.aborted) {
        throw new AiError('AI_GENERATION_CANCELLED', 'Generation was cancelled.')
      }
      throw new AiError('AI_SERVER_UNAVAILABLE', `AI server is unreachable: ${String(error)}`)
    }

    if (!response.ok || !response.body) {
      throw new AiError(
        'AI_GENERATION_FAILED',
        `AI server rejected the request (${response.status}).`
      )
    }

    return this.readStream(response.body, options)
  }

  private async readStream(
    body: ReadableStream<Uint8Array>,
    options: LlamaChatOptions
  ): Promise<string> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''
    let finishReason: string | undefined
    const idleTimeoutMs = AI_CONFIG.streamIdleTimeoutMs
    let lastChunkAt = Date.now()

    for (;;) {
      if (options.signal.aborted) {
        try {
          await reader.cancel()
        } catch {
          // Stream already closed.
        }
        throw new AiError('AI_GENERATION_CANCELLED', 'Generation was cancelled.')
      }
      if (Date.now() - lastChunkAt > idleTimeoutMs) {
        try {
          await reader.cancel()
        } catch {
          // Stream already closed.
        }
        throw new AiError('AI_GENERATION_FAILED', 'The AI response timed out.')
      }
      const { done, value } = await reader.read()
      if (done) break
      lastChunkAt = Date.now()
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const data = parseSseData(frame)
        if (data === null) continue
        if (data === '[DONE]') continue
        const delta = extractDeltaText(data)
        if (delta) {
          fullText += delta
          options.onToken(delta)
        }
        const reason = extractFinishReason(data)
        if (reason) finishReason = reason
      }
    }
    void finishReason
    return fullText
  }
}

/** Extracts SSE data payloads from a frame; null when the frame carries none. */
export function parseSseData(frame: string): string | null {
  const lines = frame.split('\n')
  const dataLines = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
  if (dataLines.length === 0) return null
  return dataLines.join('\n')
}

/** Reads streamed token text from OpenAI- and llama.cpp-style delta shapes. */
export function extractDeltaText(data: string): string {
  try {
    const payload = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: unknown }; text?: unknown }>
    }
    const choice = payload.choices?.[0]
    const delta = choice?.delta?.content
    if (typeof delta === 'string') return delta
    if (typeof choice?.text === 'string') return choice.text
  } catch {
    // Non-JSON keepalive frames carry no token text.
  }
  return ''
}

/** Reads the stream finish reason when the server provides one. */
export function extractFinishReason(data: string): string | undefined {
  try {
    const payload = JSON.parse(data) as { choices?: Array<{ finish_reason?: unknown }> }
    const reason = payload.choices?.[0]?.finish_reason
    return typeof reason === 'string' ? reason : undefined
  } catch {
    return undefined
  }
}
