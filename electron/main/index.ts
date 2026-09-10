import {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  net,
  protocol,
  screen,
  session
} from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'node:url'
import { is } from '@electron-toolkit/utils'
import { getDb, closeDb } from './db/database'
import { registerSearchHandlers } from './ipc/search.ipc'
import { registerIndexerHandlers } from './ipc/indexer.ipc'
import { registerTodoHandlers } from './ipc/todo.ipc'
import { registerSettingsHandlers } from './ipc/settings.ipc'
import {
  startInitialScan,
  hasScanCompleted,
  shutdownIndexer,
  startIndexWatchers,
  startStartupReconciliation
} from './indexer/sync'
import { IPC } from '../shared/ipc-channels'
import { clearTrustedWebContents, registerTrustedListener, trustWebContents } from './ipc/security'
import {
  FALLBACK_SPOTLIGHT_SHORTCUT,
  PRIMARY_SPOTLIGHT_SHORTCUT,
  registerSpotlightShortcut,
  type SpotlightShortcutRegistration
} from './window-shortcuts'
import { RENDERER_ENTRY_URL, RENDERER_SCHEME, resolveRendererAssetPath } from './renderer-protocol'

app.enableSandbox()
protocol.registerSchemesAsPrivileged([
  {
    scheme: RENDERER_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let shutdownStarted = false
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) app.quit()

const WINDOW_WIDTH = 680
const WINDOW_HEIGHT_COMPACT = 60
const APP_ICON_PATH = join(__dirname, '../../resources/icon.png')
const TRAY_FALLBACK_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAK+SURBVFhH1VcxaFRBEL3O3FkoVtppaXfllekstdPOVGIlVmIjJ/knWgQUUqRIYWERUFBIoZBCISCaIoiFJAHBgIIBBQMWvxB2nPd39md3//y73ZwpfPCK+zt/3szs7Oz9zn+L7sgMjhc061OWjga9IZ1m0evMV70RUSsL865X0O1j9+msvDodTgzpZLegu72RKVXBcSzMEgIXV/lAWTnjX6rzZJpyZt5cEZfp4JfnDpV1C1FFcT0Z/AKLhw5OPSC6tUa0uk20u0+095to7TPRvXWic49C21YW5qFItANljzOffUy085NagWAurnhCY4hGFqkmpNODPYd4Kq6thmI6q+T6IhkCJfKNUfY4c5T9zmuiGy+JljfloaD8Q3R+0Rdro3khkgdA9nHpsb8+0AP+OnjhiRV2ePqpadPCsAoYHrERsnVA88XrjgtvxYixX+o2DfKMEGmLaoJFRnDmgJLH646DZTESpGwD99p3kbbTLjbA/vulvfwsXPfZXxIjAQLS7BTabeBoBsoifdwTj4zFjea6I7rfAUFrNhrrCdmdp0uagd/lcIxMY5szC3YOOGx8a9q0kRO/aQPg4aAZQNDfBvQEegF7jOl39XkoDqQOJLAezyiFZgBCMBVbP2zvaH5U8smrArDjVzEQYvCkAkc3I4i5KgA7hFSDmhjJ67ui4gGN+v6r/BCkBoHmrwIAeAp+0Yw0IhhMQPcbjeifGGByEKbsDGlG5KtBFNwDucwPIroP+GG/aZTHnCBw9EX6AIgqNsylFkR8QXUL80EkQ/Di1FUAtSD8+0HN3kG7FQ9DBIGpCOAvXL0W34IaeCtWfGfTECem/s03btD5rWCjfxlERRbHrSsKabAfJIqzXKLsSZkrkH/Jb1THE8jdvjW24XJgr2xsy+SPFR6x+H60c/4oUFWFTwu2yCee55W60/kL6zgYM25oAxIAAAAASUVORK5CYII='

// ─── App lifecycle ────────────────────────────────────────────────────────────

// Disable cache to prevent locking issues and GPU cache creation errors in dev mode
app.commandLine.appendSwitch('disable-gpu-cache')
app.commandLine.appendSwitch('disable-disk-cache')
app.commandLine.appendSwitch('disable-http-cache')

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return
  // Initialize DB (runs migrations)
  getDb()
  configureSessionSecurity()
  configureRendererProtocol()

  // Register all IPC handlers
  registerSearchHandlers()
  registerIndexerHandlers()
  registerTodoHandlers()
  registerSettingsHandlers()

  // Additional window control handlers
  registerTrustedListener(IPC.APP_HIDE_WINDOW, () => mainWindow?.hide())
  registerTrustedListener(IPC.APP_QUIT, () => app.quit())
  registerTrustedListener(IPC.APP_SET_HEIGHT, (_event, height: number) => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds()
      if (bounds.height === height) return
      mainWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height })
    }
  })

  createWindow()
  const shortcutRegistration = registerGlobalShortcut()
  createTray(shortcutRegistration)

  // Start initial scan on first launch
  if (!hasScanCompleted()) {
    setTimeout(() => void startInitialScan(), 1500) // slight delay to let UI load
  } else {
    startIndexWatchers()
    // Watchers cannot observe changes made while the app was closed. The worker
    // therefore validates the trusted baseline after startup without blocking UI.
    setTimeout(() => void startStartupReconciliation(), 5000)
  }
})

app.on('second-instance', () => showWindow())

app.on('window-all-closed', () => {
  // Keep app running in tray even when window is closed
  // On non-macOS, quit only when explicitly requested
})

app.on('before-quit', (event) => {
  if (shutdownStarted) return
  shutdownStarted = true
  event.preventDefault()
  void shutdownIndexer().finally(() => app.quit())
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  closeDb()
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  } else {
    showWindow()
  }
})

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT_COMPACT,
    minWidth: 400,
    minHeight: WINDOW_HEIGHT_COMPACT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00FFFFFF',
    backgroundMaterial: 'none',
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: APP_ICON_PATH,
    center: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  const windowWebContents = mainWindow.webContents
  const windowWebContentsId = windowWebContents.id
  trustWebContents(windowWebContents)
  windowWebContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  windowWebContents.on('will-navigate', (event) => event.preventDefault())
  windowWebContents.on('will-attach-webview', (event) => event.preventDefault())

  mainWindow.on('ready-to-show', () => {
    // Force background color right before showing (workaround for some GPU drivers)
    mainWindow?.setBackgroundColor('#00FFFFFF')
    showWindow()
  })

  mainWindow.on('closed', () => {
    clearTrustedWebContents(windowWebContentsId)
    mainWindow = null
  })

  const rendererUrl =
    is.dev && process.env['ELECTRON_RENDERER_URL']
      ? process.env['ELECTRON_RENDERER_URL']
      : RENDERER_ENTRY_URL

  void mainWindow
    .loadURL(rendererUrl)
    .catch((error) => console.error(`Renderer failed to load from ${rendererUrl}`, error))
}

function configureSessionSecurity(): void {
  const defaultSession = session.defaultSession
  defaultSession.setPermissionCheckHandler(() => false)
  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false)
  )
  defaultSession.on('will-download', (event) => event.preventDefault())
}

function configureRendererProtocol(): void {
  const rendererRoot = join(__dirname, '../renderer')

  protocol.handle(RENDERER_SCHEME, (request) => {
    const assetPath = resolveRendererAssetPath(rendererRoot, request.url)
    if (!assetPath) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(assetPath).toString())
  })
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }

  // Center on current screen
  const display = screen.getPrimaryDisplay()
  const { x, y, width } = display.workArea
  mainWindow.setPosition(Math.round(x + width / 2 - WINDOW_WIDTH / 2), Math.round(y + 120))

  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.moveTop()
  mainWindow.focus()
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function createTray(shortcutRegistration: SpotlightShortcutRegistration): void {
  const packagedIcon = nativeImage.createFromPath(APP_ICON_PATH)
  const icon = (
    packagedIcon.isEmpty()
      ? nativeImage.createFromDataURL(TRAY_FALLBACK_ICON_DATA_URL)
      : packagedIcon
  ).resize({ width: 16, height: 16 })

  if (icon.isEmpty()) {
    console.error('Tray could not be created because no usable image was available.')
    return
  }

  tray = new Tray(icon)
  const shortcutLabel = formatShortcutLabel(shortcutRegistration.accelerator)
  tray.setToolTip(shortcutLabel ? `DeepDive (${shortcutLabel})` : 'DeepDive')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open DeepDive', click: showWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', showWindow)

  if (shortcutRegistration.usedFallback && process.platform === 'win32') {
    tray.displayBalloon({
      title: 'DeepDive shortcut changed',
      content: 'Ctrl+Space is already in use. Press Ctrl+Shift+Space or click the tray icon.'
    })
  }
}

// ─── Global shortcut ──────────────────────────────────────────────────────────

function registerGlobalShortcut(): SpotlightShortcutRegistration {
  const registration = registerSpotlightShortcut(
    (accelerator, callback) => globalShortcut.register(accelerator, callback),
    () => {
      if (mainWindow?.isVisible()) {
        mainWindow.hide()
      } else {
        showWindow()
      }
    }
  )

  if (registration.accelerator === FALLBACK_SPOTLIGHT_SHORTCUT) {
    console.warn('Global shortcut Ctrl+Space is in use; registered Ctrl+Shift+Space as a fallback.')
  } else if (!registration.accelerator) {
    console.error('Neither Ctrl+Space nor Ctrl+Shift+Space could be registered.')
  }

  return registration
}

function formatShortcutLabel(accelerator: string | null): string | null {
  if (accelerator === PRIMARY_SPOTLIGHT_SHORTCUT) return 'Ctrl+Space'
  if (accelerator === FALLBACK_SPOTLIGHT_SHORTCUT) return 'Ctrl+Shift+Space'
  return null
}
