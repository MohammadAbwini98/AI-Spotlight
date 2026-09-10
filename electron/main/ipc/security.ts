import {
  app,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents
} from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { isTrustedRendererUrl } from '../renderer-protocol'
import {
  TASK_TITLE_MAX_LENGTH,
  TODO_LIST_NAME_MAX_LENGTH,
  type ApiResult
} from '../../shared/types'

type IpcEvent = IpcMainEvent | IpcMainInvokeEvent

let trustedWebContentsId: number | null = null

const BOOLEAN_SETTINGS = new Set([
  'reducedMotion',
  'reducedTransparency',
  'showCompletedTasks',
  'confirmBeforeDelete'
])
const ALLOWED_SETTINGS = new Set(['theme', 'defaultPriority', 'defaultListId', ...BOOLEAN_SETTINGS])
const PRIORITIES = new Set(['none', 'low', 'medium', 'high'])
const TASK_STATES = new Set(['pending', 'dropped', 'in_progress', 'completed', 'follow_up'])

/** Restricts privileged IPC to the current top-level application renderer. */
export function trustWebContents(contents: WebContents): void {
  trustedWebContentsId = contents.id
}

export function clearTrustedWebContents(contentsId: number): void {
  if (trustedWebContentsId === contentsId) trustedWebContentsId = null
}

export function registerTrustedHandler<Arguments extends unknown[], Result>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Arguments) => Result
): void {
  ipcMain.handle(channel, (event, ...args) => {
    try {
      assertTrustedSender(event)
      validateIpcArguments(channel, args)
      return handler(event, ...(args as Arguments))
    } catch (error) {
      return invalidRequest(error)
    }
  })
}

export function registerTrustedListener<Arguments extends unknown[]>(
  channel: string,
  listener: (event: IpcMainEvent, ...args: Arguments) => void
): void {
  ipcMain.on(channel, (event, ...args) => {
    try {
      assertTrustedSender(event)
      validateIpcArguments(channel, args)
      listener(event, ...(args as Arguments))
    } catch {
      // One-way messages have no response channel. Invalid or foreign senders are ignored.
    }
  })
}

function assertTrustedSender(event: IpcEvent): void {
  if (trustedWebContentsId === null || event.sender.id !== trustedWebContentsId) {
    throw new Error('IPC sender is not the active application window.')
  }
  const senderFrame = event.senderFrame
  if (!senderFrame || senderFrame.routingId !== event.sender.mainFrame.routingId) {
    throw new Error('IPC is only accepted from the top-level application frame.')
  }

  const senderUrl = senderFrame.url
  if (isTrustedRendererUrl(senderUrl)) return

  if (app.isPackaged) {
    throw new Error('Packaged IPC requires the trusted application renderer.')
  }

  const expected = process.env.ELECTRON_RENDERER_URL
  if (!expected) {
    if (!senderUrl.startsWith('file:')) throw new Error('IPC requires a local renderer.')
    return
  }
  if (new URL(senderUrl).origin !== new URL(expected).origin) {
    throw new Error('IPC sender origin is not trusted.')
  }
}

/** Performs runtime validation before any privileged handler receives renderer input. */
export function validateIpcArguments(channel: string, args: unknown[]): void {
  switch (channel) {
    case IPC.SEARCH_QUERY:
      exactArgs(args, 1)
      validateSearchQuery(args[0])
      return
    case IPC.SEARCH_OPEN_FILE:
    case IPC.SEARCH_SHOW_IN_EXPLORER:
    case IPC.TODO_DELETE_TASK:
    case IPC.TODO_DELETE_LIST:
    case IPC.TODO_DELETE_TAG:
    case IPC.TODO_DELETE_NOTE:
    case IPC.TODO_EXPORT_NOTE_MARKDOWN:
      exactArgs(args, 1)
      positiveId(args[0], 'id')
      return
    case IPC.SEARCH_GET_RECENT:
    case IPC.SEARCH_GET_FREQUENT:
      maximumArgs(args, 1)
      if (args[0] !== undefined) boundedInteger(args[0], 'limit', 1, 200)
      return
    case IPC.TODO_GET_TASKS:
      maximumArgs(args, 1)
      if (args[0] !== undefined && args[0] !== null) positiveId(args[0], 'listId')
      return
    case IPC.TODO_CREATE_TASK:
      exactArgs(args, 1)
      validateCreateTask(args[0])
      return
    case IPC.TODO_UPDATE_TASK:
      exactArgs(args, 1)
      validateUpdateTask(args[0])
      return
    case IPC.TODO_REORDER_TASKS:
    case IPC.TODO_REORDER_LISTS:
      exactArgs(args, 1)
      idArray(args[0], 'orderedIds', 10_000)
      return
    case IPC.TODO_CREATE_LIST:
      exactArgs(args, 1)
      boundedString(record(args[0], 'list').name, 'name', 1, TODO_LIST_NAME_MAX_LENGTH)
      return
    case IPC.TODO_UPDATE_LIST:
      exactArgs(args, 2)
      positiveId(args[0], 'id')
      boundedString(args[1], 'name', 1, TODO_LIST_NAME_MAX_LENGTH)
      return
    case IPC.TODO_CREATE_TAG:
      maximumArgs(args, 2)
      boundedString(args[0], 'name', 1, 100)
      if (args[1] !== undefined) boundedString(args[1], 'color', 1, 32)
      return
    case IPC.TODO_GET_NOTES:
      maximumArgs(args, 2)
      if (args[0] !== undefined) positiveId(args[0], 'taskId')
      if (args[1] !== undefined) positiveId(args[1], 'listId')
      if (args[0] !== undefined && args[1] !== undefined) {
        throw new Error('A note cannot target both a task and a list.')
      }
      return
    case IPC.TODO_UPSERT_NOTE:
      exactArgs(args, 1)
      validateNote(args[0])
      return
    case IPC.TODO_SEARCH:
      exactArgs(args, 1)
      boundedString(args[0], 'text', 0, 512)
      return
    case IPC.SETTINGS_SET:
      exactArgs(args, 2)
      validateSetting(args[0], args[1])
      return
    case IPC.SETTINGS_ADD_SCAN_ROOT:
    case IPC.SETTINGS_REMOVE_SCAN_ROOT:
      exactArgs(args, 1)
      boundedString(args[0], 'path', 1, 32_767)
      return
    case IPC.APP_SET_HEIGHT:
      exactArgs(args, 1)
      if (![60, 480, 640].includes(args[0] as number)) {
        throw new Error('Window height is not an approved layout size.')
      }
      return
    default:
      exactArgs(args, 0)
  }
}

function validateSearchQuery(value: unknown): void {
  const query = record(value, 'query')
  boundedString(query.text, 'query.text', 0, 512)
  nonNegativeInteger(query.requestId, 'query.requestId')
  if (query.limit !== undefined) boundedInteger(query.limit, 'query.limit', 1, 200)
}

function validateCreateTask(value: unknown): void {
  const task = record(value, 'task')
  boundedString(task.title, 'task.title', 1, TASK_TITLE_MAX_LENGTH)
  optionalId(task.listId, 'task.listId')
  optionalString(task.notes, 'task.notes', 100_000)
  optionalEnum(task.priority, 'task.priority', PRIORITIES)
  optionalString(task.dueAt, 'task.dueAt', 64)
  optionalString(task.reminder, 'task.reminder', 64)
  if (task.tagIds !== undefined) idArray(task.tagIds, 'task.tagIds', 100)
}

function validateUpdateTask(value: unknown): void {
  const task = record(value, 'task')
  positiveId(task.id, 'task.id')
  if (task.title !== undefined) {
    boundedString(task.title, 'task.title', 1, TASK_TITLE_MAX_LENGTH)
  }
  optionalString(task.notes, 'task.notes', 100_000)
  optionalEnum(task.status, 'task.status', TASK_STATES)
  optionalEnum(task.priority, 'task.priority', PRIORITIES)
  optionalString(task.dueAt, 'task.dueAt', 64)
  optionalString(task.reminder, 'task.reminder', 64)
  optionalId(task.listId, 'task.listId')
  if (task.tagIds !== undefined) idArray(task.tagIds, 'task.tagIds', 100)
}

function validateNote(value: unknown): void {
  const note = record(value, 'note')
  optionalId(note.taskId, 'note.taskId')
  optionalId(note.listId, 'note.listId')
  if (note.taskId != null && note.listId != null) {
    throw new Error('A note cannot target both a task and a list.')
  }
  boundedString(note.content, 'note.content', 0, 1_000_000)
  optionalEnum(note.contentFormat, 'note.contentFormat', new Set(['plain', 'html']))
  optionalString(note.plainText, 'note.plainText', 1_000_000)
  optionalString(note.markdown, 'note.markdown', 1_000_000)
}

function validateSetting(keyValue: unknown, value: unknown): void {
  const key = boundedString(keyValue, 'setting key', 1, 64)
  const setting = boundedString(value, 'setting value', 0, 128)
  if (!ALLOWED_SETTINGS.has(key)) throw new Error('Setting key is not renderer-writable.')
  if (key === 'theme' && !['system', 'light', 'dark'].includes(setting)) {
    throw new Error('Theme value is invalid.')
  }
  if (key === 'defaultPriority' && !PRIORITIES.has(setting)) {
    throw new Error('Priority value is invalid.')
  }
  if (BOOLEAN_SETTINGS.has(key) && !['true', 'false'].includes(setting)) {
    throw new Error('Boolean setting value is invalid.')
  }
  if (key === 'defaultListId' && setting !== '' && !/^\d+$/.test(setting)) {
    throw new Error('Default list value is invalid.')
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function boundedString(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum) {
    throw new Error(`${label} must contain ${minimum}-${maximum} characters.`)
  }
  if (minimum > 0 && value.trim().length === 0) throw new Error(`${label} cannot be blank.`)
  return value
}

function optionalString(value: unknown, label: string, maximum: number): void {
  if (value !== undefined && value !== null) boundedString(value, label, 0, maximum)
}

function optionalEnum(value: unknown, label: string, values: Set<string>): void {
  if (value !== undefined && (typeof value !== 'string' || !values.has(value))) {
    throw new Error(`${label} is invalid.`)
  }
}

function positiveId(value: unknown, label: string): void {
  boundedInteger(value, label, 1, Number.MAX_SAFE_INTEGER)
}

function optionalId(value: unknown, label: string): void {
  if (value !== undefined && value !== null) positiveId(value, label)
}

function nonNegativeInteger(value: unknown, label: string): void {
  boundedInteger(value, label, 0, Number.MAX_SAFE_INTEGER)
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} is outside the allowed range.`)
  }
}

function idArray(value: unknown, label: string, maximum: number): void {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${label} must be an array with at most ${maximum} items.`)
  }
  value.forEach((id, index) => positiveId(id, `${label}[${index}]`))
}

function exactArgs(args: unknown[], expected: number): void {
  if (args.length !== expected) throw new Error('Unexpected IPC argument count.')
}

function maximumArgs(args: unknown[], maximum: number): void {
  if (args.length > maximum) throw new Error('Unexpected IPC argument count.')
}

function invalidRequest(error: unknown): ApiResult<never> {
  return {
    ok: false,
    error: {
      code: 'INVALID_IPC_REQUEST',
      message: error instanceof Error ? error.message : 'IPC request was rejected.'
    }
  }
}
