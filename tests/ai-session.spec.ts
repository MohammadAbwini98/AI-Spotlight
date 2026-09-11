import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AiSessionManager, type AiDb } from '../electron/main/ai/ai-session-manager'

/** Minimal in-memory fake implementing the AiDb surface. */
function createFakeDb(): AiDb {
  const conversations = new Map<string, { id: string; title: string }>()
  const messages: Array<{ id: string; conversation_id: string; role: string; content: string }> = []
  const now = '2026-09-10 00:00:00'
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
      if (sql.startsWith('UPDATE ai_conversations SET updated_at')) {
        return {
          get: () => undefined,
          all: () => [],
          run: () => ({ changes: 1 })
        }
      }
      if (sql.startsWith('UPDATE ai_conversations SET title')) {
        return {
          get: () => undefined,
          all: () => [],
          run: (title: string, id: string) => {
            const row = conversations.get(id)
            if (row) row.title = title
            return { changes: row ? 1 : 0 }
          }
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
      throw new Error(`Unexpected SQL in fake: ${sql}`)
    }
  }
}

describe('AI conversation persistence', () => {
  it('creates, lists, reloads, and deletes conversations', () => {
    const sessions = new AiSessionManager(createFakeDb())
    const created = sessions.createConversation()
    expect(created.id.length).toBeGreaterThan(0)
    expect(sessions.listConversations()).toHaveLength(1)
    expect(sessions.getConversation(created.id)?.id).toBe(created.id)
    expect(sessions.deleteConversation(created.id)).toBe(true)
    expect(sessions.listConversations()).toHaveLength(0)
    expect(sessions.deleteConversation(created.id)).toBe(false)
  })

  it('persists only visible user/assistant messages in order', () => {
    const sessions = new AiSessionManager(createFakeDb())
    const conversation = sessions.createConversation()
    sessions.appendMessage(conversation.id, 'user', 'Explain DI')
    sessions.appendMessage(conversation.id, 'assistant', 'Dependency injection…')
    const loaded = sessions.listMessages(conversation.id)
    expect(loaded.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(loaded[0].content).toBe('Explain DI')
  })

  it('titles untitled chats from the first user message', () => {
    const sessions = new AiSessionManager(createFakeDb())
    const conversation = sessions.createConversation()
    sessions.maybeTitleConversation(conversation.id, '  Explain dependency injection in .NET  ')
    expect(sessions.getConversation(conversation.id)?.title).toBe(
      'Explain dependency injection in .NET'
    )
    sessions.maybeTitleConversation(conversation.id, 'Second message overrides?')
    expect(sessions.getConversation(conversation.id)?.title).toBe(
      'Explain dependency injection in .NET'
    )
  })

  it('requires the migration tables to exist in the schema', () => {
    const migration = readFileSync('electron/main/db/migrations/011_ai_chat.sql', 'utf8')
    expect(migration).toContain('ai_conversations')
    expect(migration).toContain('ai_messages')
    expect(migration).toContain('ON DELETE CASCADE')
    expect(migration).toContain("role IN ('user', 'assistant')")
    expect(migration).not.toMatch(/reasoning\s+(TEXT|BLOB|INTEGER)/i)
  })
})
