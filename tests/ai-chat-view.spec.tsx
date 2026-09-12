import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AiChatHeader } from '../src/features/ai/AiChatHeader'
import { AiConversation } from '../src/features/ai/AiConversation'
import { AiComposer } from '../src/features/ai/AiComposer'
import { AiRuntimeStatus } from '../src/features/ai/AiRuntimeStatus'
import { AiChatView } from '../src/features/ai/AiChatView'
import { SearchBar } from '../src/features/search/SearchBar'

describe('AI chat view', () => {
  it('opens with navigation, empty state, and composer affordances', () => {
    const markup = renderToStaticMarkup(<AiChatView onBack={vi.fn()} />)
    expect(markup).toContain('aria-label="Back to Spotlight"')
    expect(markup).toContain('DeepDive AI')
    expect(markup).toContain('Gemma 4 12B')
    expect(markup).toContain('How can I help?')
    expect(markup).toContain('Ask DeepDive AI')
  })

  it('shows understandable runtime states instead of a bare spinner', () => {
    const starting = renderToStaticMarkup(
      <AiRuntimeStatus
        status={{ state: 'starting' }}
        model={null}
        generating={false}
        onRetry={vi.fn()}
        onSelectModel={vi.fn()}
        onStop={vi.fn()}
      />
    )
    expect(starting).toContain('Starting')
    const missing = renderToStaticMarkup(
      <AiRuntimeStatus
        status={{ state: 'error', errorCode: 'AI_MODEL_NOT_FOUND' }}
        model={null}
        generating={false}
        onRetry={vi.fn()}
        onSelectModel={vi.fn()}
        onStop={vi.fn()}
      />
    )
    expect(missing).toContain('Select model')
    const crashed = renderToStaticMarkup(
      <AiRuntimeStatus
        status={{ state: 'error', errorCode: 'AI_SERVER_UNAVAILABLE' }}
        model={null}
        generating={false}
        onRetry={vi.fn()}
        onSelectModel={vi.fn()}
        onStop={vi.fn()}
      />
    )
    expect(crashed).toContain('Restart AI')
  })

  it('distinguishes thinking from responding without exposing reasoning', () => {
    const thinking = renderToStaticMarkup(
      <AiRuntimeStatus
        status={{ state: 'generating', phase: 'thinking' }}
        model={null}
        generating={true}
        onRetry={vi.fn()}
        onSelectModel={vi.fn()}
        onStop={vi.fn()}
      />
    )
    expect(thinking).toContain('Thinking…')
    expect(thinking).toContain('Stop')
    expect(thinking).toContain('aria-live="polite"')
    expect(thinking).not.toContain('reasoning')
    const responding = renderToStaticMarkup(
      <AiRuntimeStatus
        status={{ state: 'generating', phase: 'responding' }}
        model={null}
        generating={true}
        onRetry={vi.fn()}
        onSelectModel={vi.fn()}
        onStop={vi.fn()}
      />
    )
    expect(responding).toContain('Responding…')
    expect(responding).toContain('Stop')
    const fallback = renderToStaticMarkup(
      <AiRuntimeStatus
        status={{ state: 'generating' }}
        model={null}
        generating={true}
        onRetry={vi.fn()}
        onSelectModel={vi.fn()}
        onStop={vi.fn()}
      />
    )
    expect(fallback).toContain('Generating…')
  })

  it('renders user and assistant messages with copy affordance', () => {
    const markup = renderToStaticMarkup(
      <AiConversation
        messages={[
          { id: 'u1', role: 'user', content: 'Explain DI' },
          { id: 'a1', role: 'assistant', content: '**DI** is great' }
        ]}
        generating={false}
      />
    )
    expect(markup).toContain('Explain DI')
    expect(markup).toContain('<strong>DI</strong>')
    expect(markup).toContain('Copy response')
  })

  it('disables sending while the model is not ready', () => {
    const markup = renderToStaticMarkup(
      <AiComposer
        ready={false}
        generating={false}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onKeyEscape={vi.fn()}
      />
    )
    expect(markup).toContain('disabled')
    expect(markup).toContain('Starting the local model')
  })

  it('manages conversations from the header', () => {
    const markup = renderToStaticMarkup(
      <AiChatHeader
        conversations={[{ id: 'c1', title: 'First chat', createdAt: '', updatedAt: '' }]}
        conversationId="c1"
        onBack={vi.fn()}
        onNewChat={vi.fn()}
        onSelectConversation={vi.fn()}
      />
    )
    expect(markup).toContain('aria-label="New chat"')
    expect(markup).toContain('First chat')
  })

  it('exposes the AI action from the compact search bar without touching search', () => {
    const markup = renderToStaticMarkup(
      <SearchBar
        query=""
        onChange={vi.fn()}
        onFocus={vi.fn()}
        onAiClick={vi.fn()}
        onTodoClick={vi.fn()}
        onSyncClick={vi.fn()}
        onSettingsClick={vi.fn()}
        onRecentClick={vi.fn()}
        isSyncing={false}
        isExpanded={false}
      />
    )
    expect(markup).toContain('aria-label="Open AI Assistant"')
    expect(markup).toContain('Spotlight Search')
  })
})
