const { app, ipcMain } = require('electron')
const Database = require('better-sqlite3')
const path = require('path')

app.whenReady().then(() => {
  const dbPath = path.join('c:/Users/moham/OneDrive/Desktop/Spotlight-Todo/SpotlightData/spotlight.db')
  const db = new Database(dbPath)

  const total = db.prepare('SELECT COUNT(*) as count FROM files').get()
  console.log("Total files:", total.count)

  const available = db.prepare('SELECT COUNT(*) as count FROM files WHERE is_available = 1').get()
  console.log("Available files:", available.count)

  const q = "code*"
  const results = db.prepare(`
    SELECT f.name, f.display_path
    FROM files_fts
    JOIN files f ON f.id = files_fts.rowid
    WHERE files_fts MATCH ? AND f.is_available = 1
    LIMIT 5
  `).all(q)

  console.log("Results for 'code*':", results)
  app.quit()
})
