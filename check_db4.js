const { app } = require('electron')
const Database = require('better-sqlite3')
const path = require('path')

app.whenReady().then(() => {
  const dbPath = path.join('c:/Users/moham/OneDrive/Desktop/Spotlight-Todo/SpotlightData/spotlight.db')
  const db = new Database(dbPath)

  const text = "code"
  const limit = 50
  
  function buildFtsQuery(text) {
    const escaped = text.replace(/["*^]/g, ' ')
    const tokens = escaped.trim().split(/\s+/).filter(Boolean)
    return tokens.map((t) => `"${t}"*`).join(' ')
  }

  const ftsQuery = buildFtsQuery(text)
  
  try {
    const rows = db.prepare(`
      SELECT f.*,
        bm25(files_fts) AS fts_score
      FROM files_fts
      JOIN files f ON f.id = files_fts.rowid
      WHERE files_fts MATCH ? AND f.is_available = 1
      ORDER BY
        (CASE WHEN f.name_normalized = ? THEN 10 ELSE 0 END) +
        (CASE WHEN f.name_normalized LIKE ? THEN 5 ELSE 0 END) +
        (f.open_count * 0.5) +
        (-bm25(files_fts))
        DESC
      LIMIT ?
    `).all(ftsQuery, text.toLowerCase(), `${text.toLowerCase()}%`, limit)

    console.log("Found:", rows.length)
  } catch (err) {
    console.error("ERROR:", err)
  }

  app.quit()
})
