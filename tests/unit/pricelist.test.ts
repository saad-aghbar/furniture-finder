/**
 * The owner's real price-list layout: product name written once in a merged cell, one row per
 * option (armchair, 2+3, …), header on row 4 below contact lines.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openWriteDb, type DB } from '../../src/indexer/db'
import { assignBlocks, detectHeader } from '../../src/indexer/headers'
import { Indexer } from '../../src/indexer/indexer'
import { parseFile } from '../../src/indexer/parse'
import { SearchEngine } from '../../src/main/search/engine'
import type { SearchResult } from '../../src/shared/types'

const FILE = join(__dirname, '..', 'fixtures', 'catalogue', 'מחירון סלונים 2026.xlsx')
let tmp: string
let db: DB
let engine: SearchEngine

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ff-price-'))
  db = openWriteDb(join(tmp, 'index.db')).db
  const indexer = new Indexer(db)
  indexer.syncSources([{ path: FILE, kind: 'file', addedAt: 1, status: 'ok' }])
  const out = await indexer.indexFile(FILE, { path: FILE, size: 1, mtime: 1 })
  expect(out.status).toBe('ok')
  engine = new SearchEngine(db)
})
afterAll(() => {
  db?.close()
  rmSync(tmp, { recursive: true, force: true })
})

const search = (q: string): SearchResult[] => engine.search(q, { limit: 50, fuzzy: true, sheetIds: null }).results
const options = (r: SearchResult): string[] => (r.block?.options ?? []).map((o) => o.cells.find((c) => c.header === 'כמות')?.value ?? '')

describe('price list layout', () => {
  it('finds the header row under the contact lines', async () => {
    const [sheet] = await parseFile(FILE)
    const h = detectHeader(sheet!.grid, sheet!.width)
    expect(h.headerRow).toBe(3)
    expect(h.headers.slice(1, 5)).toEqual(["מס' הדגם", 'שם הדגם', 'כמות', 'מחיר בלי בד'])
  })

  it('gives every option row its product name (merged cells)', async () => {
    const [sheet] = await parseFile(FILE)
    const rows = sheet!.grid.slice(5, 11)
    expect(rows.every((r) => r[2] === "סלון דגם מס' 8665")).toBe(true)
  })

  it('searching a model number shows the product with ALL its options', () => {
    const res = search('8665')
    const block = res.find((r) => r.title.value === "סלון דגם מס' 8665")!
    expect(block).toBeDefined()
    expect(options(block)).toEqual(['כורסא גוקר', '2+3', 'כורסא', 'דו מושבי', 'תלת מושבי', "ספה אורך 3.00 מ'"])
    expect(block.block!.options.every((o) => o.matched)).toBe(true)
    // the separate "8665 with size" row is its own result
    expect(res.some((r) => r.title.value.startsWith("סלון דגם מס' 8665 גודל"))).toBe(true)
    // one card per product, not one per row
    expect(res.length).toBe(2)
  })

  it('works for every product in the sheet', () => {
    expect(options(search('901')[0]!)).toHaveLength(6)
    expect(options(search('דרים')[0]!)).toHaveLength(5)
    expect(options(search('8888')[0]!)).toHaveLength(6)
  })

  it('an option word + model shows the product with that option marked', () => {
    const [card] = search('כורסא 8888')
    expect(card!.title.value).toBe("סלון דגם מס' 8888 עם נוצות")
    const matched = card!.block!.options.filter((o) => o.matched).map((o) => o.cells.find((c) => c.header === 'כמות')!.value)
    expect(matched).toEqual(['כורסא'])
    expect(card!.block!.options).toHaveLength(6)
  })

  it('prices match with or without the thousands comma', () => {
    for (const q of ['3850', '3,850']) {
      const res = search(q)
      const titles = res.map((r) => r.title.value)
      expect(titles).toContain("סלון דגם מס' 8665")
      const card = res.find((r) => r.title.value === "סלון דגם מס' 8665")!
      const matched = card.block!.options.filter((o) => o.matched)
      expect(matched.map((o) => o.cells.find((c) => c.header === 'מחיר בלי בד')!.value)).toEqual(['₪ 3,850'])
    }
  })

  it('single-row products stay simple cards', () => {
    const [r] = search('דובה')
    expect(r!.block).toBeUndefined()
    expect(r!.details.find((d) => d.header === 'מחיר בלי בד')?.value).toBe('₪ 2,200')
  })
})

describe('assignBlocks', () => {
  it('fills blank name cells below a product and groups them', () => {
    const rows = [
      { rowNum: 5, cells: ['Sofa A', '1'] },
      { rowNum: 6, cells: ['', '2'] },
      { rowNum: 7, cells: ['', '3'] },
      { rowNum: 8, cells: ['Chair', '4'] },
      { rowNum: 10, cells: ['', '5'] }
    ]
    expect(assignBlocks(rows, 0)).toEqual([5, 5, 5, null, null])
    expect(rows[2]!.cells[0]).toBe('Sofa A')
    expect(rows[4]!.cells[0]).toBe('') // not directly below → not inherited
  })
})
