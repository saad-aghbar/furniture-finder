import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { columnLetter, detectHeader, detectNameColumn } from '../../src/indexer/headers'
import { ParseError, decodeCsv, parseFile } from '../../src/indexer/parse'
import { isIndexable, scanSource } from '../../src/main/sources/scan'

const DIR = join(__dirname, '..', 'fixtures', 'catalogue')
const f = (name: string): string => join(DIR, name)

describe('parseFile', () => {
  it('reads xlsx with formatted text', async () => {
    const sheets = await parseFile(f('קטלוג רהיטים.xlsx'))
    expect(sheets.map((s) => s.name)).toEqual(['קטלוג', 'מבצעים'])
    const grid = sheets[0]!.grid
    expect(grid[2]).toContain('שם מוצר')
    const row = grid[3]!
    expect(row[1]).toBe('כורסה מסתובבת')
    expect(row[4]).toMatch(/2,490\.00/) // number format applied (cell.w)
  })

  it.each([
    ['legacy.xls', 'Oak dining table'],
    ['binary.xlsb', 'Swivel armchair'],
    ['open-document.ods', 'Dining chair'],
    ['suppliers/mixed/Mixed.xlsm', 'כורסה מסתובבת'],
    ['utf8.csv', 'ספסל גינה'],
    ['hebrew-1255.csv', 'מדף קיר'],
    ['arabic-1256.csv', 'رف حائط']
  ])('reads %s', async (file, expected) => {
    const sheets = await parseFile(f(file))
    const all = sheets.flatMap((s) => s.grid.flat())
    expect(all).toContain(expected)
  })

  it('reports password-protected files', async () => {
    await expect(parseFile(f('locked-with-password.xlsx'))).rejects.toMatchObject({ key: 'password' })
  })

  it('reports corrupt files', async () => {
    const err = await parseFile(f('broken.xlsx')).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ParseError)
    expect((err as ParseError).key).toBe('corrupt')
  })

  it('never modifies the source file', async () => {
    const before = readFileSync(f('קטלוג רהיטים.xlsx'))
    await parseFile(f('קטלוג רהיטים.xlsx'))
    expect(readFileSync(f('קטלוג רהיטים.xlsx')).equals(before)).toBe(true)
  })

  it('propagates merged header cells', async () => {
    const [sheet] = await parseFile(f('merged-headers.xlsx'))
    expect(sheet!.grid[0]!.slice(0, 6)).toEqual([
      'Product details',
      'Product details',
      'Dimensions (cm)',
      'Dimensions (cm)',
      'Dimensions (cm)',
      'Price'
    ])
    expect(sheet!.grid[1]![5]).toBe('Price')
  })
})

describe('decodeCsv', () => {
  it('prefers UTF-8', () => {
    expect(decodeCsv(Buffer.from('שלום,سلام'))).toBe('שלום,سلام')
  })
})

describe('header detection', () => {
  it('finds a header below title rows', async () => {
    const [sheet] = await parseFile(f('header-row-4.xlsx'))
    const h = detectHeader(sheet!.grid, sheet!.width)
    expect(h.headerRow).toBe(3)
    expect(h.headers).toEqual(['Item', 'Warehouse', 'Qty'])
  })

  it('finds the Hebrew catalogue header on row 3', async () => {
    const [sheet] = await parseFile(f('קטלוג רהיטים.xlsx'))
    const h = detectHeader(sheet!.grid, sheet!.width)
    expect(h.headerRow).toBe(2)
    expect(h.headers[1]).toBe('שם מוצר')
  })

  it('picks the sub-header row when headers are merged', async () => {
    const [sheet] = await parseFile(f('merged-headers.xlsx'))
    const h = detectHeader(sheet!.grid, sheet!.width)
    expect(h.headers[0]).toBe('Name')
  })

  it('falls back to column letters', () => {
    const h = detectHeader([['1', '2'], ['3', '4']], 2)
    expect(h.headerRow).toBe(-1)
    expect(h.headers).toEqual(['A', 'B'])
    expect(columnLetter(27)).toBe('AB')
  })
})

describe('name column', () => {
  it.each([
    [['קוד', 'שם מוצר', 'צבע'], 1],
    [['الرمز', 'اسم المنتج', 'السعر'], 1],
    [['Supplier', 'Contact', 'Phone', 'Product', 'Code'], 3],
    [['Code', 'Description', 'Price'], 1],
    [['الرمز', 'البيان'], 1]
  ])('detects %j', (headers, expected) => {
    expect(detectNameColumn(headers, [], true)).toBe(expected)
  })

  it('falls back to the first mostly-text column', () => {
    expect(detectNameColumn(['A', 'B'], [['12', 'Sofa'], ['13', 'Chair']], false)).toBe(1)
  })
})

describe('scanSource', () => {
  it('scans folders recursively and counts skipped files', async () => {
    const res = await scanSource(DIR, 'folder')
    const names = res.files.map((x) => x.path.slice(DIR.length + 1))
    expect(names).toContain('suppliers/mixed/Mixed.xlsm')
    expect(names).not.toContain('~$קטלוג רהיטים.xlsx')
    expect(res.skipped).toBe(2) // notes.txt + logo.png
    expect(res.files.length).toBe(14)
  })
  it('ignores lock files', () => {
    expect(isIndexable('/x/~$Book.xlsx')).toBe(false)
    expect(isIndexable('/x/Book.XLSX')).toBe(true)
    expect(isIndexable('/x/readme.txt')).toBe(false)
  })
  it('reports missing sources', async () => {
    expect((await scanSource(join(DIR, 'nope'), 'folder')).exists).toBe(false)
  })
})
