const { app, BrowserWindow, ipcMain } = require('electron')
const { mkdirSync, writeFileSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')
const outputDir = join(root, 'artifacts', 'design-preview')

const ok = (data) => ({ ok: true, data })
const file = (id, name, parentPath, entryType = 'file') => ({
  id,
  normalizedPath: `${parentPath}/${name}`.toLowerCase(),
  displayPath: `${parentPath}/${name}`,
  name,
  parentPath,
  entryType,
  extension: entryType === 'file' ? `.${name.split('.').pop()}` : null,
  size: 12000 * id,
  modifiedAt: new Date(2026, 6, id).toISOString(),
  indexedAt: new Date(2026, 6, id).toISOString(),
  isAvailable: true,
  openCount: 8 - id,
  lastOpenedAt: new Date(2026, 6, id).toISOString(),
  isFavorite: id === 1
})

function registerPreviewHandlers(win) {
  ipcMain.handle('settings:get', () =>
    ok({
      theme: 'light',
      reducedMotion: false,
      reducedTransparency: false,
      defaultListId: null,
      defaultPriority: 'none',
      showCompletedTasks: true,
      confirmBeforeDelete: true
    })
  )
  ipcMain.handle('settings:set', () => ok(undefined))
  ipcMain.handle('stats:getDataPath', () => ok('C:\\Users\\Preview\\SpotlightData'))
  ipcMain.handle('indexer:getStatus', () =>
    ok({
      state: 'idle',
      lastSyncAt: new Date().toISOString(),
      lastSyncDuration: 1800,
      added: 3,
      updated: 8,
      removed: 0,
      skipped: 2,
      errors: 0,
      scanRoots: ['C:\\Users\\Preview\\Documents']
    })
  )
  ipcMain.handle('search:getRecent', () =>
    ok([
      file(1, 'Design References', 'C:/Users/Preview/Documents', 'directory'),
      file(2, 'Product Roadmap.pdf', 'C:/Users/Preview/Documents'),
      file(3, 'Launch Notes.md', 'C:/Users/Preview/Desktop')
    ])
  )
  ipcMain.handle('search:getFrequent', () =>
    ok([
      file(4, 'Spotlight Todo', 'C:/Users/Preview/Projects', 'directory'),
      file(5, 'Weekly Review.docx', 'C:/Users/Preview/Documents')
    ])
  )
  ipcMain.handle('search:query', (_event, query) =>
    ok({
      requestId: query.requestId,
      entries: Array.from({ length: 50 }, (_, index) => {
        const extensions = ['pdf', 'zip', 'png', 'mp4', 'mp3', 'exe', 'docx', 'txt']
        const isFolder = index % 11 === 0
        const suffix = isFolder ? '' : `.${extensions[index % extensions.length]}`
        return file(
          100 + index,
          `Keyboard Result ${String(index + 1).padStart(2, '0')}${suffix}`,
          'C:/Users/Preview/Search',
          isFolder ? 'directory' : 'file'
        )
      }),
      totalCount: 50,
      searchMs: 1
    })
  )
  ipcMain.handle('todo:getLists', () =>
    ok([
      { id: 1, name: 'Personal', sortOrder: 0, taskCount: 2, createdAt: new Date().toISOString() },
      { id: 2, name: 'Work', sortOrder: 1, taskCount: 2, createdAt: new Date().toISOString() }
    ])
  )
  ipcMain.handle('todo:getTasks', () =>
    ok([
      {
        id: 1,
        listId: 1,
        title: 'Review glass UI details',
        notes: 'Check borders, blur, and spacing',
        status: 'pending',
        priority: 'high',
        dueAt: null,
        reminder: null,
        completedAt: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: []
      },
      {
        id: 2,
        listId: 1,
        title: 'Prepare weekly plan',
        notes: 'Capture the final interaction states',
        status: 'pending',
        priority: 'medium',
        dueAt: null,
        reminder: null,
        completedAt: null,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: []
      }
    ])
  )
  ipcMain.handle('todo:getNotes', (_event, taskId) =>
    ok({
      id: taskId,
      taskId,
      listId: null,
      content:
        '<h2>Interaction review</h2><p>Select this text to format it in place.</p><ul><li>Confirm keyboard behavior</li><li>Verify contextual controls</li></ul><table><tbody><tr><th>Area</th><th>Status</th></tr><tr><td>Task notes</td><td><strong>Ready</strong></td></tr></tbody></table>',
      contentFormat: 'html',
      plainText:
        'Interaction review\nSelect this text to format it in place.\nConfirm keyboard behavior\nVerify contextual controls\nArea\tStatus\nTask notes\tReady',
      markdown:
        '## Interaction review\n\nSelect this text to format it in place.\n\n- Confirm keyboard behavior\n- Verify contextual controls',
      updatedAt: new Date().toISOString()
    })
  )
  ipcMain.handle('todo:upsertNote', (_event, note) =>
    ok({
      id: note.taskId,
      taskId: note.taskId,
      listId: null,
      content: note.content,
      contentFormat: note.contentFormat,
      plainText: note.plainText,
      markdown: note.markdown,
      updatedAt: new Date().toISOString()
    })
  )
  ipcMain.on('app:setHeight', (_event, height) => {
    if (win.getBounds().height !== height) win.setSize(680, height, false)
  })
  ipcMain.on('app:hideWindow', () => undefined)
}

async function capture(win, filename, waitMs = 900) {
  await new Promise((resolve) => setTimeout(resolve, waitMs))
  const image = await win.webContents.capturePage()
  writeFileSync(join(outputDir, filename), image.toPNG())
}

async function measureFramePacing(win, selector, durationMs = 700) {
  return win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const target = document.querySelector(${JSON.stringify(selector)})
      if (!target) {
        resolve(null)
        return
      }

      const gaps = []
      const startedAt = performance.now()
      let previous = startedAt

      const sample = (now) => {
        gaps.push(now - previous)
        previous = now

        if (now - startedAt < ${durationMs}) {
          requestAnimationFrame(sample)
          return
        }

        resolve({
          samples: gaps.length,
          maxGapMs: Math.round(Math.max(...gaps) * 100) / 100,
          overBudgetFrames: gaps.filter((gap) => gap > 20).length
        })
      }

      target.click()
      requestAnimationFrame(sample)
    })
  `)
}

app.whenReady().then(async () => {
  mkdirSync(outputDir, { recursive: true })
  const win = new BrowserWindow({
    width: 680,
    height: 60,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00FFFFFF',
    backgroundMaterial: 'none',
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    webPreferences: {
      preload: join(root, 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  registerPreviewHandlers(win)
  await win.loadFile(join(root, 'out', 'renderer', 'index.html'))
  win.setPosition(-10000, -10000)
  win.showInactive()
  await capture(win, '00-transparent-shell.png', 250)
  await win.webContents.executeJavaScript(`
    document.documentElement.style.setProperty(
      'background',
      'linear-gradient(135deg, #b9d6e8 0%, #dbe0d5 37%, #58b7d4 58%, #087ed0 78%, #073fc0 100%)',
      'important'
    )
  `)

  await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const waitForLight = () => document.documentElement.dataset.theme === 'light'
        ? resolve()
        : setTimeout(waitForLight, 50)
      waitForLight()
    })
  `)

  await capture(win, '01-compact-light.png')
  await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = 'dark'`)
  await capture(win, '01b-compact-dark.png', 250)
  const compactDarkMaterials = await win.webContents.executeJavaScript(`(() => {
    const pill = document.querySelector('#spotlight-search-input')?.parentElement
    const action = document.querySelector('button[aria-label="Open Todo"]')
    const pillStyle = pill ? getComputedStyle(pill) : null
    const actionStyle = action ? getComputedStyle(action) : null
    return {
      pillBackground: pillStyle?.backgroundImage,
      pillColor: pillStyle?.color,
      actionBackground: actionStyle?.backgroundImage,
      actionColor: actionStyle?.color
    }
  })()`)
  await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = 'light'`)
  win.focus()
  await win.webContents.executeJavaScript(
    `document.querySelector('#spotlight-search-input')?.focus()`
  )
  await new Promise((resolve) => setTimeout(resolve, 120))
  await win.webContents.executeJavaScript(
    `document.querySelector('#spotlight-search-input')?.blur()`
  )
  await capture(win, '01c-compact-inactive-light.png', 700)
  const inactiveCompact = await win.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#spotlight-search-input')
    const pill = input?.parentElement
    const bar = pill?.parentElement
    return {
      actionsHidden: !document.querySelector('button[aria-label="Open Todo"]'),
      pillWidth: pill?.clientWidth ?? 0,
      barWidth: bar?.clientWidth ?? 0
    }
  })()`)
  await win.webContents.executeJavaScript(
    `document.querySelector('#spotlight-search-input')?.focus()`
  )
  await new Promise((resolve) => setTimeout(resolve, 700))
  const recentClicked = await win.webContents.executeJavaScript(
    `Boolean(document.querySelector('button[aria-label="Show recent files"]')?.click() ?? true)`
  )
  await capture(win, '02-expand-090ms.png', 90)
  await capture(win, '03-expand-240ms.png', 150)
  await capture(win, '04-search-expanded-light.png', 850)
  const searchPanel = await win.webContents.executeJavaScript(`(() => {
    const panel = [...document.querySelectorAll('div')].find((node) => node.className.includes?.('expandedContent'))
    if (!panel) return null
    const shell = panel.parentElement
    const style = getComputedStyle(shell)
    const firstRow = panel.querySelector('[role="option"]')
    const rowStyle = firstRow ? getComputedStyle(firstRow) : null
    return {
      text: panel.textContent,
      background: style.backgroundColor,
      size: [shell.clientWidth, shell.clientHeight],
      firstRow: firstRow ? { opacity: rowStyle.opacity, display: rowStyle.display, transform: rowStyle.transform, size: [firstRow.clientWidth, firstRow.clientHeight] } : null
    }
  })()`)
  await win.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`
  )
  await new Promise((resolve) => setTimeout(resolve, 750))
  const todoClicked = await win.webContents.executeJavaScript(
    `Boolean(document.querySelector('button[aria-label="Open Todo"]')?.click() ?? true)`
  )
  await capture(win, '05-todo-light.png', 1300)
  await win.webContents.executeJavaScript(
    `document.querySelector('[data-note-trigger="true"]')?.click()`
  )
  await capture(win, '05b-note-panel-light.png', 700)
  const richNotesInteraction = await win.webContents.executeJavaScript(`
    new Promise(async (resolve) => {
      const editor = document.querySelector('[contenteditable][aria-label="Task notes content"]')
      if (!editor) return resolve({ passed: false, reason: 'editor missing' })

      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
      let target = null
      while (walker.nextNode()) {
        if (walker.currentNode.textContent?.includes('Select this text')) {
          target = walker.currentNode
          break
        }
      }
      if (!target) return resolve({ passed: false, reason: 'selection target missing' })

      editor.focus()
      const selectionRange = document.createRange()
      selectionRange.setStart(target, 0)
      selectionRange.setEnd(target, 'Select this text'.length)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(selectionRange)
      document.dispatchEvent(new Event('selectionchange'))
      await new Promise((nextFrame) => requestAnimationFrame(() => requestAnimationFrame(nextFrame)))

      const toolbar = document.querySelector('[role="toolbar"][aria-label="Text formatting"]')
      const shell = editor.parentElement
      const toolbarRect = toolbar?.getBoundingClientRect()
      const shellRect = shell?.getBoundingClientRect()
      const toolbarInside = Boolean(
        toolbarRect && shellRect &&
        toolbarRect.left >= shellRect.left && toolbarRect.right <= shellRect.right &&
        toolbarRect.top >= shellRect.top && toolbarRect.bottom <= shellRect.bottom
      )

      selection.removeAllRanges()
      const slashBlock = document.createElement('p')
      slashBlock.textContent = '/head'
      editor.append(slashBlock)
      const slashRange = document.createRange()
      slashRange.selectNodeContents(slashBlock)
      slashRange.collapse(false)
      selection.addRange(slashRange)
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
      await new Promise((nextFrame) => requestAnimationFrame(() => requestAnimationFrame(nextFrame)))
      const slashMenuOpened = Boolean(document.querySelector('[aria-label="Slash commands"]'))
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await new Promise((nextFrame) => requestAnimationFrame(() => requestAnimationFrame(nextFrame)))

      resolve({
        passed:
          Boolean(toolbar) &&
          toolbarInside &&
          slashMenuOpened &&
          !editor.textContent.includes('/head') &&
          !editor.querySelector('table h1, table h2, table h3, table h4'),
        contentEditable: editor.getAttribute('contenteditable') === 'true',
        toolbarInside,
        slashMenuOpened,
        slashCommandRemoved: !editor.textContent.includes('/head'),
        tableFormattingIsolated: !editor.querySelector('table h1, table h2, table h3, table h4'),
        tablePresent: Boolean(editor.querySelector('table')),
        textareaAbsent: !document.querySelector('aside[aria-label="Task notes"] textarea')
      })
    })
  `)
  await capture(win, '05c-note-contextual-formatting-light.png', 250)
  const notesOutsideDismissal = await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const taskSearch = document.querySelector('input[aria-label="Search tasks"]')
      taskSearch?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      taskSearch?.click()
      setTimeout(
        () => resolve(!document.querySelector('aside[aria-label="Task notes"]')),
        1200
      )
    })
  `)
  const createTaskClicked = await win.webContents.executeJavaScript(
    `Boolean(document.querySelector('button[aria-label="Add task"]')?.click() ?? true)`
  )
  await capture(win, '06-create-task-light.png', 1000)
  await win.webContents.executeJavaScript(
    `document.querySelector('button[aria-label="Close task editor"]')?.click()`
  )
  await new Promise((resolve) => setTimeout(resolve, 500))
  await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = 'dark'`)
  const settingsClicked = await win.webContents.executeJavaScript(
    `Boolean(document.querySelector('button[title="Settings"]')?.click() ?? true)`
  )
  await capture(win, '07-settings-dark.png', 1300)

  await win.webContents.executeJavaScript(`document.querySelector('button')?.click()`)
  await new Promise((resolve) => setTimeout(resolve, 800))
  const expandFramePacing = await measureFramePacing(win, 'button[aria-label="Show recent files"]')
  await new Promise((resolve) => setTimeout(resolve, 300))
  await win.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`
  )
  await new Promise((resolve) => setTimeout(resolve, 700))
  const todoFramePacing = await measureFramePacing(win, 'button[aria-label="Open Todo"]')

  await win.webContents.executeJavaScript(`
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Search')?.click()
  `)
  await new Promise((resolve) => setTimeout(resolve, 800))
  await win.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('#spotlight-search-input')
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setValue.call(input, 'Keyboard Result')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.focus()
    })()
  `)
  await new Promise((resolve) => setTimeout(resolve, 1700))
  await capture(win, '08-categorized-search-dark.png', 200)
  const keyboardSearchScrolling = await win.webContents.executeJavaScript(`
    new Promise(async (resolve) => {
      const input = document.querySelector('#spotlight-search-input')
      const list = document.querySelector('#search-results')
      const selectedIndex = () =>
        [...list.querySelectorAll('[role="option"]')]
          .findIndex((row) => row.getAttribute('aria-selected') === 'true')

      for (let index = 0; index < 25; index += 1) {
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown', bubbles: true, cancelable: true
        }))
      }
      await new Promise((nextFrame) => requestAnimationFrame(() => requestAnimationFrame(nextFrame)))
      const down = { selectedIndex: selectedIndex(), scrollTop: list.scrollTop }

      for (let index = 0; index < 25; index += 1) {
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowUp', bubbles: true, cancelable: true
        }))
      }
      await new Promise((nextFrame) => requestAnimationFrame(() => requestAnimationFrame(nextFrame)))
      const up = { selectedIndex: selectedIndex(), scrollTop: list.scrollTop }

      resolve({ down, up, passed: down.selectedIndex === 25 && down.scrollTop > 0 && up.selectedIndex === 0 && up.scrollTop === 0 })
    })
  `)

  console.log(
    JSON.stringify({
      recentClicked,
      inactiveCompact,
      compactDarkMaterials,
      todoClicked,
      richNotesInteraction,
      notesOutsideDismissal,
      createTaskClicked,
      settingsClicked,
      searchPanel,
      expandFramePacing,
      todoFramePacing,
      keyboardSearchScrolling
    })
  )

  win.destroy()
  app.quit()
})
