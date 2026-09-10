// Shared IPC channel name constants — used by main process handlers and preload bridge.
// Changing a channel name here requires updating both the IPC handler and the preload.

export const IPC = {
  // ─── Search / Indexer ───────────────────────────────────────────────────
  SEARCH_QUERY: 'search:query',
  SEARCH_OPEN_FILE: 'search:openFile',
  SEARCH_SHOW_IN_EXPLORER: 'search:showInExplorer',
  SEARCH_GET_RECENT: 'search:getRecent',
  SEARCH_GET_FREQUENT: 'search:getFrequent',
  SEARCH_CLEAR_HISTORY: 'search:clearHistory',

  // ─── Indexer / Scan ─────────────────────────────────────────────────────
  INDEXER_START_SCAN: 'indexer:startScan',
  INDEXER_CANCEL_SCAN: 'indexer:cancelScan',
  INDEXER_START_SYNC: 'indexer:startSync',
  INDEXER_CANCEL_SYNC: 'indexer:cancelSync',
  INDEXER_PAUSE_SYNC: 'indexer:pauseSync',
  INDEXER_RESUME_SYNC: 'indexer:resumeSync',
  INDEXER_GET_STATUS: 'indexer:getStatus',
  INDEXER_PROGRESS: 'indexer:progress', // main → renderer (push)
  INDEXER_SCAN_COMPLETE: 'indexer:scanComplete', // main → renderer (push)

  // ─── Todo ────────────────────────────────────────────────────────────────
  TODO_GET_TASKS: 'todo:getTasks',
  TODO_CREATE_TASK: 'todo:createTask',
  TODO_UPDATE_TASK: 'todo:updateTask',
  TODO_DELETE_TASK: 'todo:deleteTask',
  TODO_REORDER_TASKS: 'todo:reorderTasks',
  TODO_GET_LISTS: 'todo:getLists',
  TODO_CREATE_LIST: 'todo:createList',
  TODO_UPDATE_LIST: 'todo:updateList',
  TODO_DELETE_LIST: 'todo:deleteList',
  TODO_REORDER_LISTS: 'todo:reorderLists',
  TODO_GET_TAGS: 'todo:getTags',
  TODO_CREATE_TAG: 'todo:createTag',
  TODO_DELETE_TAG: 'todo:deleteTag',
  TODO_GET_NOTES: 'todo:getNotes',
  TODO_UPSERT_NOTE: 'todo:upsertNote',
  TODO_DELETE_NOTE: 'todo:deleteNote',
  TODO_EXPORT_NOTE_MARKDOWN: 'todo:exportNoteMarkdown',
  TODO_SEARCH: 'todo:search',

  // ─── Settings ────────────────────────────────────────────────────────────
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_SCAN_ROOTS: 'settings:getScanRoots',
  SETTINGS_ADD_SCAN_ROOT: 'settings:addScanRoot',
  SETTINGS_REMOVE_SCAN_ROOT: 'settings:removeScanRoot',
  SETTINGS_RESET_SCAN_ROOTS: 'settings:resetScanRoots',
  SETTINGS_SELECT_FOLDER: 'settings:selectFolder',

  // ─── Stats / Health ──────────────────────────────────────────────────────
  STATS_GET_INDEX_STATS: 'stats:getIndexStats',
  STATS_GET_SYNC_STATUS: 'stats:getSyncStatus',
  STATS_GET_DATA_PATH: 'stats:getDataPath',

  // ─── App ─────────────────────────────────────────────────────────────────
  APP_HIDE_WINDOW: 'app:hideWindow',
  APP_QUIT: 'app:quit',
  APP_SET_HEIGHT: 'app:setHeight'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
