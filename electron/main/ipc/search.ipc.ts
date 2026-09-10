import { shell } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getDb } from '../db/database'
import type { FileEntry, SearchQuery, SearchResult, ApiResult } from '../../shared/types'
import { registerTrustedHandler } from './security'
import { getUnsafeLaunchReason } from '../security/file-launch'

export function registerSearchHandlers(): void {
  // ─── Search query ────────────────────────────────────────────────────────
  registerTrustedHandler(
    IPC.SEARCH_QUERY,
    (_event, query: SearchQuery): ApiResult<SearchResult> => {
      try {
        const db = getDb()
        const start = Date.now()
        const limit = Math.min(query.limit ?? 50, 200)
        const text = query.text.trim()

        let rows: unknown[]

        if (!text) {
          // Empty query — return recently opened + frequent
          rows = db
            .prepare(
              `
          SELECT * FROM files
          WHERE is_available = 1
          ORDER BY last_opened_at DESC NULLS LAST, open_count DESC
          LIMIT ?
        `
            )
            .all(limit)
        } else {
          // FTS5 search with ranking
          const ftsQuery = buildFtsQuery(text)
          const candidateLimit = Math.min(1600, Math.max(256, limit * 8))
          rows = db
            .prepare(
              `
          WITH fts_candidates AS MATERIALIZED (
            SELECT rowid, rank AS fts_score
            FROM files_fts
            WHERE files_fts MATCH ?
            ORDER BY rank
            LIMIT ?
          )
          SELECT f.*, candidate.fts_score
          FROM fts_candidates AS candidate
          JOIN files AS f ON f.id = candidate.rowid
          WHERE f.is_available = 1
          ORDER BY
            (CASE WHEN f.name_normalized = ? THEN 10 ELSE 0 END) +
            (CASE WHEN f.name_normalized LIKE ? THEN 5 ELSE 0 END) +
            (f.open_count * 0.5) +
            (-candidate.fts_score)
            DESC
          LIMIT ?
        `
            )
            .all(ftsQuery, candidateLimit, text.toLowerCase(), `${text.toLowerCase()}%`, limit)
        }

        const entries = rows.map(rowToFileEntry)
        return {
          ok: true,
          data: {
            requestId: query.requestId,
            entries,
            totalCount: entries.length,
            searchMs: Date.now() - start
          }
        }
      } catch (err) {
        return { ok: false, error: { code: 'SEARCH_ERROR', message: String(err) } }
      }
    }
  )

  // ─── Open file ───────────────────────────────────────────────────────────
  registerTrustedHandler(
    IPC.SEARCH_OPEN_FILE,
    async (_event, id: number): Promise<ApiResult<void>> => {
      try {
        const db = getDb()
        const entry = db
          .prepare('SELECT display_path, entry_type FROM files WHERE id = ?')
          .get(id) as { display_path: string; entry_type: 'file' | 'directory' } | undefined

        if (!entry)
          return { ok: false, error: { code: 'NOT_FOUND', message: 'File not found in index' } }

        if (entry.entry_type === 'file') {
          const unsafeReason = getUnsafeLaunchReason(entry.display_path)
          if (unsafeReason) {
            return { ok: false, error: { code: 'UNSAFE_FILE_TYPE', message: unsafeReason } }
          }
        }

        const error = await shell.openPath(entry.display_path)
        if (error) {
          // Mark as unavailable if file no longer exists
          db.prepare('UPDATE files SET is_available = 0 WHERE id = ?').run(id)
          return { ok: false, error: { code: 'OPEN_FAILED', message: error } }
        }

        // Update open history
        db.prepare(
          `
        UPDATE files SET
          open_count     = open_count + 1,
          last_opened_at = datetime('now'),
          first_opened_at = COALESCE(first_opened_at, datetime('now'))
        WHERE id = ?
      `
        ).run(id)

        return { ok: true, data: undefined }
      } catch (err) {
        return { ok: false, error: { code: 'OPEN_ERROR', message: String(err) } }
      }
    }
  )

  // ─── Show in Explorer ────────────────────────────────────────────────────
  registerTrustedHandler(IPC.SEARCH_SHOW_IN_EXPLORER, (_event, id: number): ApiResult<void> => {
    try {
      const db = getDb()
      const entry = db.prepare('SELECT display_path FROM files WHERE id = ?').get(id) as
        { display_path: string } | undefined

      if (!entry) return { ok: false, error: { code: 'NOT_FOUND', message: 'File not found' } }

      shell.showItemInFolder(entry.display_path)
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'EXPLORER_ERROR', message: String(err) } }
    }
  })

  // ─── Get recent ──────────────────────────────────────────────────────────
  registerTrustedHandler(IPC.SEARCH_GET_RECENT, (_event, limit = 20): ApiResult<FileEntry[]> => {
    try {
      const db = getDb()
      const rows = db
        .prepare(
          `
        SELECT * FROM files
        WHERE is_available = 1 AND last_opened_at IS NOT NULL
        ORDER BY last_opened_at DESC
        LIMIT ?
      `
        )
        .all(limit)
      return { ok: true, data: rows.map(rowToFileEntry) }
    } catch (err) {
      return { ok: false, error: { code: 'RECENT_ERROR', message: String(err) } }
    }
  })

  // ─── Get frequent ────────────────────────────────────────────────────────
  registerTrustedHandler(IPC.SEARCH_GET_FREQUENT, (_event, limit = 20): ApiResult<FileEntry[]> => {
    try {
      const db = getDb()
      const rows = db
        .prepare(
          `
        SELECT * FROM files
        WHERE is_available = 1 AND open_count > 0
        ORDER BY open_count DESC, last_opened_at DESC
        LIMIT ?
      `
        )
        .all(limit)
      return { ok: true, data: rows.map(rowToFileEntry) }
    } catch (err) {
      return { ok: false, error: { code: 'FREQUENT_ERROR', message: String(err) } }
    }
  })

  // ─── Clear history ───────────────────────────────────────────────────────
  registerTrustedHandler(IPC.SEARCH_CLEAR_HISTORY, (): ApiResult<void> => {
    try {
      const db = getDb()
      db.prepare(
        'UPDATE files SET open_count = 0, last_opened_at = NULL, first_opened_at = NULL'
      ).run()
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'CLEAR_ERROR', message: String(err) } }
    }
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFtsQuery(text: string): string {
  // Escape special FTS5 characters
  const escaped = text.replace(/["*^]/g, ' ')
  const tokens = escaped.trim().split(/\s+/).filter(Boolean)
  // Prefix match on each token
  return tokens.map((t) => `"${t}"*`).join(' ')
}

function rowToFileEntry(row: unknown): FileEntry {
  const r = row as Record<string, unknown>
  return {
    id: r.id as number,
    normalizedPath: r.normalized_path as string,
    displayPath: r.display_path as string,
    name: r.name as string,
    parentPath: r.parent_path as string,
    entryType: r.entry_type as 'file' | 'directory',
    extension: r.extension as string | null,
    size: r.size as number,
    modifiedAt: r.modified_at as string | null,
    indexedAt: r.indexed_at as string,
    isAvailable: Boolean(r.is_available),
    openCount: r.open_count as number,
    lastOpenedAt: r.last_opened_at as string | null,
    isFavorite: Boolean(r.is_favorite)
  }
}
