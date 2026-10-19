import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openWriteDb, type DB } from '../../src/indexer/db'
import { Indexer } from '../../src/indexer/indexer'
import { SearchEngine, rowKey } from '../../src/main/search/engine'
import { editDistance, fuzzyDistance, parseQuery } from '../../src/main/search/query'
import { scanSource } from '../../src/main/sources/scan'
import type { SearchResult } from '../../src/shared/types'

const DIR = join(__dirname, '..', 'fixtures', 'catalogue')
let tmp: string
let db: DB
let engine: SearchEngine
const outcomes: Record<string, { status: string; error?: string }> = {}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ff-search-'))
  db = openWriteDb(join(tmp, 'index.db')).db
  const indexer = new Indexer(db)
  indexer.syncSources([{ path: DIR, kind: 'folder', addedAt: 1, status: 'ok' }])
  const scan = await scanSource(DIR, 'folder')
  for (const file of scan.files) {
    const out = await indexer.indexFile(DIR, file)
    outcomes[file.path.slice(DIR.length + 1)] = out
  }
  engine = new SearchEngine(db)
})

afterAll(() => {
  db?.close()
  rmSync(tmp, { recursive: true, force: true })
})

const search = (q: string, extra: Partial<Parameters<SearchEngine['search']>[1]> = {}): SearchResult[] =>
  engine.search(q, { limit: 50, fuzzy: true, sheetIds: null, ...extra }).results
const titles = (q: string): string[] => search(q).map((r) => r.title.value)

describe('indexing', () => {
  it('indexes good files and reports bad ones without failing', () => {
    expect(outcomes['broken.xlsx']).toMatchObject({ status: 'error', error: 'corrupt' })
    expect(outcomes['locked-with-password.xlsx']).toMatchObject({ status: 'error', error: 'password' })
    expect(outcomes['קטלוג רהיטים.xlsx']).toMatchObject({ status: 'ok' })
  })

  it('skips unchanged files by hash', async () => {
    const indexer = new Indexer(db)
    const scan = await scanSource(DIR, 'folder')
    const out = await indexer.indexFile(DIR, scan.files[0]!)
    expect(out.skipped).toBe(true)
  })
})

describe('search – languages', () => {
  it('finds Hebrew partial words', () => {
    expect(titles('כורס')).toEqual(expect.arrayContaining(['כורסה מסתובבת']))
  })
  it('ignores niqqud in the data', () => {
    expect(titles('כורסה נוחה')).toContain('כּוּרְסָה נוֹחָה לטלוויזיה')
  })
  it('ignores niqqud in the query', () => {
    expect(titles('כֻּרְסָה')).toContain('כורסה מסתובבת')
  })
  it('matches Hebrew final letters', () => {
    expect(titles('ארון')).toContain('ארון הזזה שלוש דלתות')
    expect(titles('ארונ')).toContain('ארון הזזה שלוש דלתות')
  })
  it('finds Arabic partial words and ignores tashkeel', () => {
    expect(titles('كنب')).toContain('كَنَبَة ثلاثية')
    expect(titles('كنبة')).toContain('كَنَبَة ثلاثية')
  })
  it('folds Arabic letter variants', () => {
    expect(titles('اريكه')).toContain('أريكة زاوية كبيرة')
    expect(titles('كرسي هزاز')).toContain('كرسى هزاز')
  })
  it('matches Arabic-Indic digits with Latin digits', () => {
    expect(search('1203').some((r) => r.cells.some((c) => c.value === 'ك-١٢٠٣'))).toBe(true)
  })
  it('finds English case-insensitively', () => {
    expect(titles('OAK')).toEqual(expect.arrayContaining(['Oak dining table', 'Oak bookcase']))
  })
  it('handles mixed-language queries (all words must match the row)', () => {
    const r = search('sofa ספה')
    expect(new Set(r.map((x) => x.title.value))).toEqual(new Set(['Sofa']))
    expect(search('sofa ספה كنبة').length).toBe(r.length)
  })
  it('finds rows in xls, xlsb, ods and csv files', () => {
    expect(search('garden bench')[0]?.fileName).toBe('utf8.csv')
    expect(search('מדף קיר')[0]?.fileName).toBe('hebrew-1255.csv')
    expect(search('رف حائط')[0]?.fileName).toBe('arabic-1256.csv')
    expect(search('Dining chair').map((r) => r.fileName)).toContain('open-document.ods')
    expect(search('swivel').map((r) => r.fileName)).toContain('binary.xlsb')
  })
})

describe('search – codes', () => {
  it('matches codes exactly and by prefix', () => {
    const exact = search('A-1203')
    expect(exact.length).toBeGreaterThan(0)
    expect(exact.every((r) => r.cells.some((c) => c.value.startsWith('A-1203')))).toBe(true)
    const prefix = search('A-12')
    const codes = prefix.flatMap((r) => r.cells.map((c) => c.value)).filter((v) => v.startsWith('A-12'))
    expect(codes).toEqual(expect.arrayContaining(['A-1203', 'A-1204', 'A-1210']))
  })
  it('matches codes typed without separators', () => {
    expect(search('b123').some((r) => r.cells.some((c) => c.value === 'B-12/3'))).toBe(true)
  })
  it('handles short (1–2 letter) terms', () => {
    expect(search('C-7').some((r) => r.cells.some((c) => c.value === 'C-7'))).toBe(true)
    const x9 = search('X-9 kitchen')
    expect(x9.length).toBeGreaterThan(0)
    expect(x9.every((r) => r.cells.some((c) => c.value === 'X-9'))).toBe(true)
  })
})

describe('search – phrases, typos, ranking', () => {
  it('quoted phrases match exactly', () => {
    expect(titles('"dining table"')).toEqual(expect.arrayContaining(['Dining table']))
    expect(titles('"table dining"')).toEqual([])
  })
  it('tolerates typos when exact results are few', () => {
    const res = engine.search('recliner chiar', { limit: 50, fuzzy: true, sheetIds: null })
    expect(res.results.map((r) => r.title.value)).toContain('Recliner chair')
    expect(res.fuzzyUsed).toBe(true)
    expect(res.results[0]!.similar).toBe(true)
  })
  it('does not use fuzzy matching when disabled', () => {
    expect(engine.search('recliner chiar', { limit: 50, fuzzy: false, sheetIds: null }).results).toEqual([])
  })
  it('ranks exact cell and name-column matches first', () => {
    expect(titles('sofa')[0]).toBe('Sofa')
  })
  it('gives a bonus to recently copied rows', () => {
    const base = search('oak')
    const second = base[1]!
    const boosted = search('oak', {
      recentlyCopied: new Set([rowKey(second.filePath, second.sheetName, second.rowNum)])
    })
    expect(boosted[0]!.rowId).toBe(second.rowId)
  })
})

describe('search – results', () => {
  it('returns title, header:value details and source', () => {
    const r = search('כורסה מסתובבת').find((x) => x.fileName === 'קטלוג רהיטים.xlsx')!
    expect(r.sheetName).toBe('קטלוג')
    expect(r.rowNum).toBe(4)
    expect(r.title.header).toBe('שם מוצר')
    expect(r.details.find((d) => d.header === 'מחיר')?.value).toMatch(/2,490/)
    expect(r.details.find((d) => d.header === 'קוד')?.value).toBe('A-1203')
  })
  it('computes highlight ranges against the original text', () => {
    const r = search('נוחה')[0]!
    const h = r.title.highlights[0]!
    expect(r.title.value.slice(h.start, h.end)).toBe('נוֹחָה')
    const ar = search('كنبه').find((x) => x.title.value === 'كَنَبَة ثلاثية')!
    const ah = ar.title.highlights[0]!
    expect(ar.title.value.slice(ah.start, ah.end)).toBe('كَنَبَة')
  })
  it('applies scope (file / sheet)', () => {
    const file = join(DIR, 'קטלוג רהיטים.xlsx')
    const ids = engine.resolveScope([{ type: 'sheet', path: file, sheet: 'מבצעים' }])!
    const res = search('ספה', { sheetIds: ids })
    expect(res.length).toBe(1)
    expect(res[0]!.sheetName).toBe('מבצעים')
    const all = search('ספה')
    expect(all.length).toBeGreaterThan(1)
    expect(search('ספה', { sheetIds: [] })).toEqual([])
    expect(engine.resolveScope([{ type: 'source', path: DIR }])!.length).toBeGreaterThan(5)
  })
  it('flags offline sources', () => {
    expect(search('sofa', { offlineSources: new Set([DIR]) })[0]!.offline).toBe(true)
  })
  it('never throws on odd input', () => {
    for (const q of ['"', '""', '*', 'AND OR NOT', '((', "'", '%_', 'a', '-', '   ']) {
      expect(() => search(q)).not.toThrow()
    }
  })
})

describe('query helpers', () => {
  it('parses phrases and terms', () => {
    expect(parseQuery('"Oak Table" sofa').map((g) => [g.original, g.phrase])).toEqual([
      ['oak table', true],
      ['sofa', false]
    ])
  })
  it('keeps Hebrew abbreviations intact', () => {
    expect(parseQuery('מע"מ').map((g) => g.original)).toEqual(['מעמ'])
  })
  it('computes edit distances with transpositions', () => {
    expect(editDistance('chair', 'chiar', 2)).toBe(1)
    expect(editDistance('sofa', 'sofas', 1)).toBe(1)
    expect(editDistance('table', 'cable', 1)).toBe(1)
    expect(editDistance('abcdef', 'uvwxyz', 2)).toBe(3)
    expect(fuzzyDistance('reclin', 'recliner', 1)).toBe(0)
    expect(fuzzyDistance('kornisa', 'כורסה', 1)).toBe(2)
  })
})
