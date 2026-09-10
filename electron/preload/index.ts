import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  SearchQuery,
  SearchResult,
  FileEntry,
  IndexerProgress,
  SyncStatus,
  IndexStats,
  Task,
  TodoList,
  Tag,
  Note,
  CreateTaskInput,
  UpdateTaskInput,
  CreateListInput,
  UpsertNoteInput,
  AppSettings,
  ApiResult
} from '../shared/types'

// Typed window.electronAPI surface exposed to the renderer
const api = {
  // ─── Search ──────────────────────────────────────────────────────────────
  search: {
    query: (q: SearchQuery): Promise<ApiResult<SearchResult>> =>
      ipcRenderer.invoke(IPC.SEARCH_QUERY, q),
    openFile: (id: number): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IPC.SEARCH_OPEN_FILE, id),
    showInExplorer: (id: number): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IPC.SEARCH_SHOW_IN_EXPLORER, id),
    getRecent: (limit?: number): Promise<ApiResult<FileEntry[]>> =>
      ipcRenderer.invoke(IPC.SEARCH_GET_RECENT, limit),
    getFrequent: (limit?: number): Promise<ApiResult<FileEntry[]>> =>
      ipcRenderer.invoke(IPC.SEARCH_GET_FREQUENT, limit),
    clearHistory: (): Promise<ApiResult<void>> => ipcRenderer.invoke(IPC.SEARCH_CLEAR_HISTORY)
  },

  // ─── Indexer ─────────────────────────────────────────────────────────────
  indexer: {
    startScan: (): Promise<ApiResult<void>> => ipcRenderer.invoke(IPC.INDEXER_START_SCAN),
    cancelScan: (): Promise<ApiResult<void>> => ipcRenderer.invoke(IPC.INDEXER_CANCEL_SCAN),
    startSync: (): Promise<ApiResult<void>> => ipcRenderer.invoke(IPC.INDEXER_START_SYNC),
    cancelSync: (): Promise<ApiResult<void>> => ipcRenderer.invoke(IPC.INDEXER_CANCEL_SYNC),
    pauseSync: (): Promise<ApiResult<void>> => ipcRenderer.invoke(IPC.INDEXER_PAUSE_SYNC),
    resumeSync: (): Promise<ApiResult<void>> => ipcRenderer.invoke(IPC.INDEXER_RESUME_SYNC),
    getStatus: (): Promise<ApiResult<SyncStatus>> => ipcRenderer.invoke(IPC.INDEXER_GET_STATUS),
    onProgress: (cb: (progress: IndexerProgress) => void): (() => void) => {
      const handler = (_: Electron.IpcRendererEvent, progress: IndexerProgress): void =>
        cb(progress)
      ipcRenderer.on(IPC.INDEXER_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC.INDEXER_PROGRESS, handler)
    }
  },

  // ─── Todo ─────────────────────────────────────────────────────────────────
  todo: {
    getTasks: (listId?: number | null): Promise<ApiResult<Task[]>> =>
      ipcRenderer.invoke(IPC.TODO_GET_TASKS, listId),
    createTask: (input: CreateTaskInput): Promise<ApiResult<Task>> =>
      ipcRenderer.invoke(IPC.TODO_CREATE_TASK, input),
    updateTask: (input: UpdateTaskInput): Promise<ApiResult<Task>> =>
      ipcRenderer.invoke(IPC.TODO_UPDATE_TASK, input),
    deleteTask: (id: number): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IPC.TODO_DELETE_TASK, id),
    reorderTasks: (orderedIds: number[]): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IPC.TODO_REORDER_TASKS, orderedIds),
    getLists: (): Promise<ApiResult<TodoList[]>> => ipcRenderer.invoke(IPC.TODO_GET_LISTS),
    createList: (input: CreateListInput): Promise<ApiResult<TodoList>> =>
      ipcRenderer.invoke(IPC.TODO_CREATE_LIST, input),
    updateList: (id: number, name: string): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IPC.TODO_UPDATE_LIST, id, name),
    deleteList: (id: number): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IPC.TODO_DELETE_LIST, id),
    reorderLists: (orderedIds: number[]): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IPC.TODO_REORDER_LISTS, orderedIds),
    getTags: (): Promise<ApiResult<Tag[]>> => ipcRenderer.invoke(IPC.TODO_GET_TAGS),
    createTag: (name: string, color?: string): Promise<ApiResult<Tag>> =>
      ipcRenderer.invoke(IPC.TODO_CREATE_TAG, name, color),
    deleteTag: (id: number): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IPC.TODO_DELETE_TAG, id),
    getNotes: (taskId?: number, listId?: number): Promise<ApiResult<Note | null>> =>
      ipcRenderer.invoke(IPC.TODO_GET_NOTES, taskId, listId),
    upsertNote: (input: UpsertNoteInput): Promise<ApiResult<Note>> =>
      ipcRenderer.invoke(IPC.TODO_UPSERT_NOTE, input),
    deleteNote: (id: number): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IPC.TODO_DELETE_NOTE, id),
    exportNoteMarkdown: (taskId: number): Promise<ApiResult<string | null>> =>
      ipcRenderer.invoke(IPC.TODO_EXPORT_NOTE_MARKDOWN, taskId),
    search: (text: string): Promise<ApiResult<Task[]>> => ipcRenderer.invoke(IPC.TODO_SEARCH, text)
  },

  // ─── Settings ─────────────────────────────────────────────────────────────
  settings: {
    get: (): Promise<ApiResult<AppSettings>> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (key: string, value: string): Promise<ApiResult<void>> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET, key, value),
    getScanRoots: (): Promise<ApiResult<string[]>> =>
      ipcRenderer.invoke(IPC.SETTINGS_GET_SCAN_ROOTS),
    addScanRoot: (path: string): Promise<ApiResult<string[]>> =>
      ipcRenderer.invoke(IPC.SETTINGS_ADD_SCAN_ROOT, path),
    removeScanRoot: (path: string): Promise<ApiResult<string[]>> =>
      ipcRenderer.invoke(IPC.SETTINGS_REMOVE_SCAN_ROOT, path),
    resetScanRoots: (): Promise<ApiResult<string[]>> =>
      ipcRenderer.invoke(IPC.SETTINGS_RESET_SCAN_ROOTS),
    selectFolder: (): Promise<ApiResult<string | null>> =>
      ipcRenderer.invoke(IPC.SETTINGS_SELECT_FOLDER)
  },

  // ─── Stats ────────────────────────────────────────────────────────────────
  stats: {
    getIndexStats: (): Promise<ApiResult<IndexStats>> =>
      ipcRenderer.invoke(IPC.STATS_GET_INDEX_STATS),
    getSyncStatus: (): Promise<ApiResult<SyncStatus>> => ipcRenderer.invoke(IPC.INDEXER_GET_STATUS),
    getDataPath: (): Promise<ApiResult<string>> => ipcRenderer.invoke(IPC.STATS_GET_DATA_PATH)
  },

  // ─── App ──────────────────────────────────────────────────────────────────
  app: {
    hide: (): void => ipcRenderer.send(IPC.APP_HIDE_WINDOW),
    quit: (): void => ipcRenderer.send(IPC.APP_QUIT),
    setHeight: (height: number): void => ipcRenderer.send(IPC.APP_SET_HEIGHT, height)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

// TypeScript type augmentation for window.electronAPI
export type ElectronAPI = typeof api
