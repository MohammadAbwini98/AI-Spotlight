import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MockAiProvider } from '../electron/main/ai/ai-provider'

describe('AI provider abstraction', () => {
  it('streams mock tokens without loading a model', async () => {
    const provider = new MockAiProvider()
    const chunks: string[] = []
    const controller = new AbortController()
    const text = await provider.generate(
      { requestId: 'r-1', messages: [{ id: 'm-1', role: 'user', content: 'ping' }] },
      { onToken: (token) => chunks.push(token) },
      controller.signal
    )
    expect(text).toContain('ping')
    expect(chunks.join('')).toBe(text)
  })

  it('supports status, shutdown, and conversation stubs', async () => {
    const provider = new MockAiProvider()
    expect(provider.getStatus().state).toBe('ready')
    await expect(provider.ensureReady()).resolves.toMatchObject({ state: 'ready' })
    provider.cancel('r-1')
    await provider.shutdown()
    expect(provider.getStatus().state).toBe('stopped')
    await expect(provider.getModelInfo()).resolves.toMatchObject({ runtime: 'mock' })
  })

  it('keeps search and AI architecturally separated', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    expect(app).toMatch(/'search' \| 'ai' \| 'todo' \| 'settings'/)
    const searchView = readFileSync('src/features/search/SearchView.tsx', 'utf8')
    expect(searchView).not.toContain('electronAPI.ai')
    const searchBar = readFileSync('src/features/search/SearchBar.tsx', 'utf8')
    expect(searchBar).toContain('onAiClick')
    expect(searchBar).not.toContain('electronAPI.ai')
    const aiView = readFileSync('src/features/ai/AiChatView.tsx', 'utf8')
    expect(aiView).not.toContain('electronAPI.search')
    expect(aiView).not.toContain('electronAPI.indexer')
    const searchIpc = readFileSync('electron/main/ipc/search.ipc.ts', 'utf8')
    expect(searchIpc).not.toMatch(/ai-runtime|llama|ensureReady/i)
  })

  it('starts the runtime lazily from the AI view only', () => {
    const main = readFileSync('electron/main/index.ts', 'utf8')
    expect(main).toContain('registerAiHandlers')
    expect(main).toContain('shutdownAi')
    // Startup scan/sync paths never touch the AI runtime.
    const sync = readFileSync('electron/main/indexer/sync.ts', 'utf8')
    expect(sync).not.toMatch(/ai-runtime|llama|gemma/i)
  })
})
