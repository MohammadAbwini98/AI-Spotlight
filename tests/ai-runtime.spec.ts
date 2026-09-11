import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import {
  buildServerArgs,
  pickFreeLoopbackPort,
  waitForHealth
} from '../electron/main/ai/llama-process-manager'
import {
  extractDeltaText,
  extractFinishReason,
  parseSseData
} from '../electron/main/ai/llama-client'
import { AiError, aiUserMessage } from '../electron/main/ai/ai-errors'

describe('llama.cpp process policy', () => {
  it('binds loopback only and never uses a shell', () => {
    const config = readFileSync('electron/main/ai/ai-config.ts', 'utf8')
    expect(config).toContain("host: '127.0.0.1'")
    const source = readFileSync('electron/main/ai/llama-process-manager.ts', 'utf8')
    expect(source).toContain('AI_CONFIG.host')
    expect(source).not.toContain("'0.0.0.0'")
    expect(source).not.toContain('"0.0.0.0"')
    expect(source).toContain('shell: false')
    expect(source).not.toMatch(/shell:\s*true/)
    expect(source).not.toMatch(/\bexec\(/)
  })

  it('builds loopback server arguments without renderer input', () => {
    const args = buildServerArgs({
      modelPath: 'C:\\models\\m.gguf',
      port: 42111,
      threads: 6,
      contextSize: 8192
    })
    expect(args).toContain('--host')
    expect(args[args.indexOf('--host') + 1]).toBe('127.0.0.1')
    expect(args).toContain('--port')
    expect(args).not.toContain('0.0.0.0')
  })

  it('picks a free loopback port instead of assuming one', async () => {
    const port = await pickFreeLoopbackPort()
    expect(Number.isInteger(port)).toBe(true)
    expect(port).toBeGreaterThan(0)
  })

  it('polls health with a timeout instead of sleeping blindly', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200).end('ok')
        return
      }
      res.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    await expect(waitForHealth(`http://127.0.0.1:${port}`, 5000, 50)).resolves.toBeUndefined()
    server.close()
  })

  it('times out when the runtime never becomes healthy', async () => {
    const port = await pickFreeLoopbackPort()
    await expect(waitForHealth(`http://127.0.0.1:${port}`, 300, 50)).rejects.toMatchObject({
      code: 'AI_RUNTIME_TIMEOUT'
    })
  })
})

describe('llama.cpp streaming protocol', () => {
  it('parses SSE data frames and ignores keepalives', () => {
    expect(parseSseData(': keep-alive')).toBeNull()
    expect(parseSseData('data: {"a":1}')).toBe('{"a":1}')
  })

  it('extracts token text from OpenAI-style deltas', () => {
    expect(extractDeltaText('{"choices":[{"delta":{"content":"Hello"}}]}')).toBe('Hello')
    expect(extractDeltaText('{"choices":[{"text":"Hi"}]}')).toBe('Hi')
    expect(extractDeltaText('not json')).toBe('')
  })

  it('reads finish reasons when provided', () => {
    expect(extractFinishReason('{"choices":[{"finish_reason":"stop"}]}')).toBe('stop')
    expect(extractFinishReason('{}')).toBeUndefined()
  })
})

describe('AI error taxonomy', () => {
  it('maps every code to a user message without stack traces', () => {
    const codes = [
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
    ] as const
    for (const code of codes) {
      const message = aiUserMessage(code)
      expect(typeof message).toBe('string')
      expect(message.length).toBeGreaterThan(0)
      expect(message).not.toMatch(/at\s+\S+\s+\(|Error:/)
    }
    const error = new AiError('AI_BUSY', 'busy')
    expect(error.code).toBe('AI_BUSY')
    expect(error).toBeInstanceOf(Error)
  })
})
