import type {
  AiChatRequest,
  AiConversation,
  AiConversationMessage,
  AiModelInfo,
  AiRuntimeStatus
} from '../../shared/types'

export interface GenerateEvents {
  onToken: (text: string) => void
}

/**
 * Test seam for the AI runtime. Production uses AiRuntimeService (llama.cpp);
 * unit tests use MockAiProvider. No test ever loads the 12B model.
 */
export interface AiProvider {
  getStatus(): AiRuntimeStatus
  ensureReady(): Promise<AiRuntimeStatus>
  generate(request: AiChatRequest, events: GenerateEvents, signal: AbortSignal): Promise<string>
  cancel(requestId: string): void
  shutdown(): Promise<void>
  getModelInfo(): Promise<AiModelInfo>
  createConversation(title?: string): AiConversation
  listConversations(): AiConversation[]
  listMessages(conversationId: string): AiConversationMessage[]
  deleteConversation(conversationId: string): boolean
}

/** Deterministic in-memory provider for unit tests. */
export class MockAiProvider implements AiProvider {
  private generating = false
  readonly generated: AiChatRequest[] = []
  status: AiRuntimeStatus = { state: 'ready', modelId: 'mock-model' }

  getStatus(): AiRuntimeStatus {
    return this.status
  }

  async ensureReady(): Promise<AiRuntimeStatus> {
    return this.status
  }

  async generate(
    request: AiChatRequest,
    events: GenerateEvents,
    signal: AbortSignal
  ): Promise<string> {
    if (this.generating) throw Object.assign(new Error('busy'), { code: 'AI_BUSY' })
    this.generating = true
    try {
      this.generated.push(request)
      const text = `mock:${request.messages.map((message) => message.content).join('|')}`
      for (const chunk of ['mock:', text.slice('mock:'.length)]) {
        if (signal.aborted)
          throw Object.assign(new Error('cancelled'), { code: 'AI_GENERATION_CANCELLED' })
        if (chunk) events.onToken(chunk)
      }
      return text
    } finally {
      this.generating = false
    }
  }

  cancel(): void {
    // Mock generations are synchronous; nothing to abort.
  }

  async shutdown(): Promise<void> {
    this.status = { state: 'stopped' }
  }

  async getModelInfo(): Promise<AiModelInfo> {
    return {
      modelId: 'mock-model',
      name: 'Mock Model',
      quantization: 'TEST',
      filename: 'mock.gguf',
      path: null,
      installed: false,
      valid: false,
      runtime: 'mock'
    }
  }

  createConversation(): AiConversation {
    return { id: 'mock-conversation', title: 'Mock', createdAt: '', updatedAt: '' }
  }

  listConversations(): AiConversation[] {
    return []
  }

  listMessages(): AiConversationMessage[] {
    return []
  }

  deleteConversation(): boolean {
    return false
  }
}
