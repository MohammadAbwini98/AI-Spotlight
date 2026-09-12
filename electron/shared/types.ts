// Shared TypeScript types used by both main process and renderer.
// Import via @shared/types in both electron/ and src/.

// ─── File Entry ─────────────────────────────────────────────────────────────

export type EntryType = 'file' | 'directory'

export interface FileEntry {
  id: number
  normalizedPath: string
  displayPath: string
  name: string
  parentPath: string
  entryType: EntryType
  extension: string | null
  size: number
  modifiedAt: string | null
  indexedAt: string
  isAvailable: boolean
  openCount: number
  lastOpenedAt: string | null
  isFavorite: boolean
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchQuery {
  text: string
  limit?: number
  requestId: number
}

export interface SearchResult {
  requestId: number
  entries: FileEntry[]
  totalCount: number
  searchMs: number
}

// ─── Indexer Progress ────────────────────────────────────────────────────────

export type ScanMode = 'initial' | 'incremental' | 'reconcile'

export type ScanState =
  | 'idle'
  | 'preparing'
  | 'scanning'
  | 'reconciling'
  | 'paused'
  | 'cancelling'
  | 'complete'
  | 'complete_with_warnings'
  | 'failed'
  | 'cancelled'

export interface SyncCounters {
  discovered: number
  added: number
  updated: number
  unchanged: number
  newlyUnavailable: number
  restored: number
  skipped: number
  excluded: number
  errors: number
  directoriesVisited: number
  filesVisited: number
  bytesRepresented: number
}

export interface IndexerProgress extends SyncCounters {
  runId: string | null
  mode: ScanMode | null
  state: ScanState
  currentRoot: string | null
  currentPath: string | null
  elapsedMs: number
  throughputPerSecond: number
  batchSize: number
}

export interface SyncStatus extends SyncCounters {
  runId: string | null
  mode: ScanMode | null
  state: ScanState
  lastSyncAt: string | null
  lastSyncDuration: number | null
  scanRoots: string[]
}

export interface IndexStats {
  fileCount: number
  folderCount: number
  totalEntries: number
  dbSizeBytes: number
  lastSyncAt: string | null
}

// ─── Todo ─────────────────────────────────────────────────────────────────────

export type TaskPriority = 'none' | 'low' | 'medium' | 'high'
export type TaskStatus = 'pending' | 'dropped' | 'in_progress' | 'completed' | 'follow_up'
export const TODO_LIST_NAME_MAX_LENGTH = 40
export const TASK_TITLE_MAX_LENGTH = 120

export interface Task {
  id: number
  listId: number | null
  title: string
  notes: string | null
  status: TaskStatus
  priority: TaskPriority
  dueAt: string | null
  reminder: string | null
  completedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  tags: Tag[]
}

export interface CreateTaskInput {
  listId?: number | null
  title: string
  notes?: string | null
  priority?: TaskPriority
  dueAt?: string | null
  reminder?: string | null
  tagIds?: number[]
}

export interface UpdateTaskInput {
  id: number
  title?: string
  notes?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  dueAt?: string | null
  reminder?: string | null
  listId?: number | null
  tagIds?: number[]
}

export interface TodoList {
  id: number
  name: string
  sortOrder: number
  taskCount: number
  createdAt: string
}

export interface CreateListInput {
  name: string
}

export interface Tag {
  id: number
  name: string
  color: string | null
}

export interface Note {
  id: number
  taskId: number | null
  listId: number | null
  content: string
  contentFormat: NoteContentFormat
  plainText: string
  markdown: string
  updatedAt: string
}

export type NoteContentFormat = 'plain' | 'html'

export interface UpsertNoteInput {
  taskId?: number | null
  listId?: number | null
  content: string
  contentFormat?: NoteContentFormat
  plainText?: string
  markdown?: string
}

// ─── Settings ────────────────────────────────────────────────────────────────

export type Theme = 'system' | 'light' | 'dark'

export interface AppSettings {
  theme: Theme
  reducedMotion: boolean
  reducedTransparency: boolean
  defaultListId: number | null
  defaultPriority: TaskPriority
  showCompletedTasks: boolean
  confirmBeforeDelete: boolean
}

// ─── API Error ───────────────────────────────────────────────────────────────

export interface ApiError {
  code: string
  message: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

// ─── AI Assistant (local Gemma via llama.cpp) ───────────────────────────────
// The renderer talks to the AI subsystem only through the typed preload
// `window.electronAPI.ai` domain API. Search stays on SQLite/FTS5 and never
// touches these types.

export type AiRole = 'system' | 'user' | 'assistant'

export interface AiMessage {
  id: string
  role: AiRole
  content: string
}

export interface AiChatRequest {
  requestId: string
  conversationId?: string
  messages: AiMessage[]
}

export type AiRuntimeState = 'stopped' | 'starting' | 'loading' | 'ready' | 'generating' | 'error'

/**
 * Fine-grained generation phase for long hidden-reasoning models.
 * The model can spend minutes generating reasoning before the first visible
 * answer token; the phase lets the UI report Thinking vs Responding without
 * ever exposing, persisting, or streaming reasoning content.
 */
export type AiGenerationPhase = 'preparing' | 'thinking' | 'responding'

export type AiErrorCode =
  | 'AI_RUNTIME_NOT_FOUND'
  | 'AI_RUNTIME_START_FAILED'
  | 'AI_RUNTIME_TIMEOUT'
  | 'AI_MODEL_NOT_FOUND'
  | 'AI_MODEL_INVALID'
  | 'AI_MODEL_HASH_MISMATCH'
  | 'AI_MODEL_UNSUPPORTED'
  | 'AI_SERVER_UNAVAILABLE'
  | 'AI_GENERATION_FAILED'
  | 'AI_GENERATION_CANCELLED'
  | 'AI_REQUEST_TOO_LARGE'
  | 'AI_TOO_MANY_MESSAGES'
  | 'AI_BUSY'
  | 'AI_OUT_OF_MEMORY'
  | 'AI_NOT_READY'

export interface AiRuntimeStatus {
  state: AiRuntimeState
  /** Model id from the model manifest (for example "gemma-4-12b-it-q4-k-m"). */
  modelId?: string
  /** Generation sub-state. Present only while starting/loading/generating. */
  phase?: AiGenerationPhase
  /** Loopback base URL of the managed llama-server instance. Never exposed with a path. */
  errorCode?: AiErrorCode
  error?: string
}

export interface AiTokenDelta {
  requestId: string
  text: string
}

export interface AiCompletion {
  requestId: string
  finishReason?: string
}

export interface AiConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface AiConversationMessage extends AiMessage {
  conversationId: string
  createdAt: string
}

export interface AiModelInfo {
  modelId: string
  name: string
  quantization: string
  filename: string
  /** Absolute path when a model file is installed, otherwise null. */
  path: string | null
  installed: boolean
  valid: boolean
  runtime: string
}

export interface AiImportProgress {
  bytesCopied: number
  totalBytes: number
}

// Renderer-enforced request bounds. The main process re-validates every value
// at runtime (see electron/main/ipc/security.ts) and never trusts these.
export const AI_MAX_MESSAGE_CHARS = 8000
export const AI_MAX_MESSAGES_PER_REQUEST = 64
export const AI_MAX_REQUEST_CHARS = 32000
export const AI_MAX_CONVERSATIONS = 200
