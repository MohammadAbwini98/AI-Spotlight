import { randomUUID } from 'node:crypto'
import type { AiConversation, AiConversationMessage, AiRole } from '../../shared/types'

/** Minimal structural DB surface. better-sqlite3 satisfies it; tests use fakes. */
export interface AiDbStatement {
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
  run(...params: unknown[]): { changes: number }
}

export interface AiDb {
  prepare(sql: string): AiDbStatement
}

interface ConversationRow {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  created_at: string
}

/**
 * Persists only visible user/assistant messages. Hidden reasoning, chain of
 * thought, KV cache, and runtime diagnostics are never written here.
 */
export class AiSessionManager {
  constructor(private readonly db: AiDb) {}

  createConversation(title = 'New chat'): AiConversation {
    const id = randomUUID()
    this.db
      .prepare('INSERT INTO ai_conversations (id, title) VALUES (?, ?)')
      .run(id, title.slice(0, 120))
    return this.getConversation(id) as AiConversation
  }

  getConversation(id: string): AiConversation | null {
    const row = this.db
      .prepare('SELECT id, title, created_at, updated_at FROM ai_conversations WHERE id = ?')
      .get(id) as ConversationRow | undefined
    if (!row) return null
    return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at }
  }

  listConversations(limit = 50): AiConversation[] {
    const rows = this.db
      .prepare(
        'SELECT id, title, created_at, updated_at FROM ai_conversations ORDER BY updated_at DESC LIMIT ?'
      )
      .all(limit) as ConversationRow[]
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  deleteConversation(id: string): boolean {
    this.db.prepare('DELETE FROM ai_messages WHERE conversation_id = ?').run(id)
    const result = this.db.prepare('DELETE FROM ai_conversations WHERE id = ?').run(id)
    return result.changes > 0
  }

  appendMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
  ): AiConversationMessage {
    const id = randomUUID()
    this.db
      .prepare('INSERT INTO ai_messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
      .run(id, conversationId, role, content)
    this.db
      .prepare("UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?")
      .run(conversationId)
    return this.getMessage(id) as AiConversationMessage
  }

  getMessage(id: string): AiConversationMessage | null {
    const row = this.db
      .prepare(
        'SELECT id, conversation_id, role, content, created_at FROM ai_messages WHERE id = ?'
      )
      .get(id) as MessageRow | undefined
    if (!row) return null
    return toConversationMessage(row)
  }

  listMessages(conversationId: string, limit = 500): AiConversationMessage[] {
    const rows = this.db
      .prepare(
        'SELECT id, conversation_id, role, content, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY rowid ASC LIMIT ?'
      )
      .all(conversationId, limit) as MessageRow[]
    return rows.map(toConversationMessage)
  }

  /** Derives a title from the first user message when the chat is still untitled. */
  maybeTitleConversation(conversationId: string, userText: string): void {
    const conversation = this.getConversation(conversationId)
    if (!conversation || conversation.title !== 'New chat') return
    const title = userText.trim().replace(/\s+/g, ' ').slice(0, 60) || 'New chat'
    this.db.prepare('UPDATE ai_conversations SET title = ? WHERE id = ?').run(title, conversationId)
  }
}

function toConversationMessage(row: MessageRow): AiConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as AiRole,
    content: row.content,
    createdAt: row.created_at
  }
}
