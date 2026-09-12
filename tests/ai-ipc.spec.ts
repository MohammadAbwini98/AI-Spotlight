import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { IPC } from '../electron/shared/ipc-channels'
import {
  AI_MAX_MESSAGE_CHARS,
  AI_MAX_MESSAGES_PER_REQUEST,
  AI_MAX_REQUEST_CHARS
} from '../electron/shared/types'
import { validateIpcArguments } from '../electron/main/ipc/security'

function validRequest(overrides = {}): Record<string, unknown> {
  return {
    requestId: 'req-123',
    conversationId: 'conv-1',
    messages: [{ id: 'm-1', role: 'user', content: 'Hello' }],
    ...overrides
  }
}

describe('AI IPC validation', () => {
  it('accepts a well-formed chat request', () => {
    expect(() => validateIpcArguments(IPC.AI_CHAT_START, [validRequest()])).not.toThrow()
  })

  it('rejects malformed, oversized, and untrusted-shape requests', () => {
    expect(() => validateIpcArguments(IPC.AI_CHAT_START, [])).toThrow()
    expect(() =>
      validateIpcArguments(IPC.AI_CHAT_START, [validRequest({ requestId: '../evil' })])
    ).toThrow()
    expect(() =>
      validateIpcArguments(IPC.AI_CHAT_START, [
        validRequest({ messages: [{ id: 'm', role: 'superuser', content: 'x' }] })
      ])
    ).toThrow(/role/i)
    expect(() =>
      validateIpcArguments(IPC.AI_CHAT_START, [
        validRequest({
          messages: [{ id: 'm', role: 'user', content: 'x'.repeat(AI_MAX_MESSAGE_CHARS + 1) }]
        })
      ])
    ).toThrow()
    const tooMany = Array.from({ length: AI_MAX_MESSAGES_PER_REQUEST + 1 }, (_, index) => ({
      id: `m-${index}`,
      role: 'user',
      content: 'x'
    }))
    expect(() =>
      validateIpcArguments(IPC.AI_CHAT_START, [validRequest({ messages: tooMany })])
    ).toThrow()
    const tooBig = Array.from({ length: 5 }, (_, index) => ({
      id: `m-${index}`,
      role: 'user',
      content: 'x'.repeat(Math.ceil(AI_MAX_REQUEST_CHARS / 4))
    }))
    expect(() =>
      validateIpcArguments(IPC.AI_CHAT_START, [validRequest({ messages: tooBig })])
    ).toThrow(/exceeds/i)
  })

  it('validates cancellation, conversation, and lifecycle channels', () => {
    expect(() => validateIpcArguments(IPC.AI_CHAT_CANCEL, ['req-1'])).not.toThrow()
    expect(() => validateIpcArguments(IPC.AI_CHAT_CANCEL, ['..'])).toThrow()
    expect(() => validateIpcArguments(IPC.AI_GET_MESSAGES, ['conv-1'])).not.toThrow()
    expect(() => validateIpcArguments(IPC.AI_DELETE_CONVERSATION, ['conv-1'])).not.toThrow()
    expect(() => validateIpcArguments(IPC.AI_NEW_CONVERSATION, [])).not.toThrow()
    expect(() => validateIpcArguments(IPC.AI_NEW_CONVERSATION, ['My chat'])).not.toThrow()
    expect(() => validateIpcArguments(IPC.AI_NEW_CONVERSATION, ['x', 'y'])).toThrow()
    for (const channel of [
      IPC.AI_GET_STATUS,
      IPC.AI_ENSURE_READY,
      IPC.AI_GET_CONVERSATIONS,
      IPC.AI_GET_MODEL_INFO,
      IPC.AI_SELECT_MODEL,
      IPC.AI_CANCEL_IMPORT,
      IPC.AI_SHUTDOWN
    ]) {
      expect(() => validateIpcArguments(channel, [])).not.toThrow()
      expect(() => validateIpcArguments(channel, ['unexpected'])).toThrow()
    }
  })

  it('keeps search IPC validation unchanged', () => {
    expect(() =>
      validateIpcArguments(IPC.SEARCH_QUERY, [{ text: 'invoice', requestId: 1 }])
    ).not.toThrow()
    expect(() => validateIpcArguments(IPC.APP_SET_HEIGHT, [640])).not.toThrow()
    expect(() => validateIpcArguments(IPC.APP_SET_HEIGHT, [999])).toThrow(/approved/i)
  })

  it('exposes a narrow typed preload surface without native capabilities', () => {
    const preload = readFileSync('electron/preload/index.ts', 'utf8')
    expect(preload).toContain('window.electronAPI')
    expect(preload).toContain('ai: {')
    for (const method of [
      'getStatus',
      'ensureReady',
      'chatStart',
      'chatCancel',
      'onDelta',
      'onComplete',
      'onError',
      'newConversation',
      'getConversations',
      'getMessages',
      'deleteConversation',
      'getModelInfo',
      'selectModel',
      'cancelImport',
      'onImportProgress',
      'shutdown'
    ]) {
      expect(preload).toContain(method)
    }
    expect(preload).not.toMatch(/\bchild_process\b/)
    expect(preload).not.toMatch(/\bspawn\s*\(/)
    expect(preload).not.toMatch(/\.exec\s*\(/)
    expect(preload).not.toMatch(/\bshell\s*:/)
    expect(preload).not.toMatch(/\bfetch\s*\(/)
  })
})
