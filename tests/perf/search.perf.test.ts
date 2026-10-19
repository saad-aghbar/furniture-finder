/**
 * Performance check: 500k rows, typical queries must answer in < 50 ms.
 * Run with `npm run test:perf` (not part of the default suite – it takes ~30 s to build).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openWriteDb, type DB } from '../../src/indexer/db'
import { SearchEngine } from '../../src/main/search/engine'
import { fuzzyTokens, indexText } from '../../src/shared/normalize'

const ROWS = 500_000
let tmp: string
let db: DB
let engine: SearchEngine

const names = ['Sofa', 'Armchair', 'Dining table', 'Chair', 'Bed', 'Wardrobe', 'ספה תלת מושבית', 'כורסה מסתובבת', 'שולחן אוכל', 'كنبة زاوية', 'طاولة قهوة', 'كرسي مكتب', 'Bookcase', 'Recliner', 'Bar stool']
// ~20k distinct pseudo-words so the typo-tolerance pass sees a realistic vocabulary
const SYL = ['ka', 'lo', 'mi', 'ra', 'te', 'sun', 'bel', 'dor', 'fa', 'gi', 'han', 'jo', 'ku', 'lem', 'nor', 'pi', 'qua', 'ro', 'sa', 'tor', 'vi', 'wen', 'xa', 'yo', 'zel']
const word = (i: number): string => SYL[i % 25]! + SYL[Math.floor(i / 25) % 25]! + SYL[Math.floor(i / 625) % 25]! + (i >= 15625 ? SYL[Math.floor(i / 15625) % 25] : '')
const colours = ['Grey', 'Walnut', 'Oak', 'White', 'Black', 'אפור', 'رمادي', 'בז׳', 'أبيض']

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ff-perf-'))
  db = openWriteDb(join(tmp, 'index.db')).db
  db.prepare("INSERT INTO sources(kind, path, added_at) VALUES ('folder', '/perf', 0)").run()
  db.prepare("INSERT INTO files(source_id, path, name, status) VALUES (1, '/perf/big.xlsx', 'big.xlsx', 'ok')").run()
  const sheets = 10
  for (let s = 0; s < sheets; s++) {
    db.prepare("INSERT INTO sheets(file_id, name, idx, headers_json, name_col) VALUES (1, ?, ?, ?, 1)").run(`S${s}`, s, JSON.stringify(['Code', 'Name', 'Colour', 'Price', 'Stock', 'Supplier', 'Notes']))
  }
  const ins = db.prepare('INSERT INTO rows(sheet_id, row_num, cells_json, display_title, norm_text) VALUES (?, ?, ?, ?, ?)')
  const tok = db.prepare('INSERT OR IGNORE INTO vocab(token) VALUES (?)')
  const t0 = performance.now()
  db.transaction(() => {
    for (let i = 0; i < ROWS; i++) {
      const cells = [`P-${i}`, `${names[i % names.length]} ${i % 997}`, colours[i % colours.length]!, String(100 + (i % 5000)), String(i % 50), `Supplier ${i % 300}`, `${word(i % 20000)} ${word((i * 7) % 20000)}`]
      const norm = indexText(cells)
      ins.run((i % sheets) + 1, i + 2, JSON.stringify(cells), cells[1], norm)
      for (const t of fuzzyTokens(norm)) tok.run(t)
    }
  })()
  const secs = (performance.now() - t0) / 1000
  console.log(`indexed ${ROWS} rows in ${secs.toFixed(1)} s (${Math.round(ROWS / secs)} rows/s)`)
  engine = new SearchEngine(db)
}, 300_000)

afterAll(() => {
  db?.close()
  rmSync(tmp, { recursive: true, force: true })
})

const QUERIES = ['sofa', 'kalomi', 'kalomx', 'sunbeldxr', 'כורסה', 'كنبه', 'walnut sofa', 'P-12345', 'P-4999', 'supplier 17', 'רמדי', '"dining table" oak', 'كرسي مكتب 12', 'recliner']

describe('search performance (500k rows)', () => {
  it.each(QUERIES)('%s answers in < 50 ms', (q) => {
    engine.search(q, { limit: 50, fuzzy: true, sheetIds: null }) // warm up statement cache
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      engine.search(q, { limit: 50, fuzzy: true, sheetIds: null })
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    const median = times[2]!
    console.log(`${q.padEnd(22)} median ${median.toFixed(1)} ms`)
    expect(median).toBeLessThan(50)
  })
})
