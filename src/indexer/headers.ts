import { normalize } from '../shared/normalize'

/** Rows inspected when looking for the header row. */
const HEADER_SCAN_ROWS = 15

/** Header keywords that identify the "name-like" column, grouped by weight. */
const NAME_WORDS = ['name', 'title', 'שם', 'اسم', 'الاسم', 'البيان']
const ITEM_WORDS = ['product', 'item', 'model', 'מוצר', 'פריט', 'דגם', 'منتج', 'صنف', 'موديل']
const DESC_WORDS = ['description', 'desc', 'תיאור', 'وصف']

/** Words that typically appear in a header row (used to pick it over title / contact rows). */
const HEADER_WORDS = [
  ...NAME_WORDS, ...ITEM_WORDS, ...DESC_WORDS,
  'price', 'qty', 'quantity', 'code', 'colour', 'color', 'size', 'supplier', 'stock', 'cost',
  'מחיר', 'כמות', 'קוד', 'מקט', 'צבע', 'מידה', 'מידות', 'ספק', 'מלאי', 'עלות', 'מס',
  'سعر', 'السعر', 'كمية', 'الكمية', 'رمز', 'الرمز', 'لون', 'اللون', 'مقاس', 'المورد', 'مورد', 'رقم'
]

const normWords = (words: string[]): string[] => words.map((w) => normalize(w))
const NAME_N = normWords(NAME_WORDS)
const ITEM_N = normWords(ITEM_WORDS)
const DESC_N = normWords(DESC_WORDS)
const HEADER_N = new Set(normWords(HEADER_WORDS))

/** How many cells of a row look like column titles ("שם הדגם", "מחיר", "Price"…). */
function headerWordHits(row: string[]): number {
  let hits = 0
  for (const cell of row) {
    if (!cell || cell.length > 40) continue
    const words = normalize(cell).split(' ')
    if (words.some((w) => HEADER_N.has(w))) hits++
  }
  return hits
}

export function isNumericLike(s: string): boolean {
  // numbers, prices, percentages, dates – anything without letters
  return s.length > 0 && !/\p{L}/u.test(s)
}

export function columnLetter(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export interface HeaderInfo {
  /** 0-based index of the header row in the grid, or -1 when the sheet has no header row. */
  headerRow: number
  headers: string[]
}

/**
 * Pick the header row: the first row (within the first 15) that has many non-numeric text cells
 * and is followed by rows that fill the same columns. Falls back to column letters.
 */
export function detectHeader(grid: string[][], width: number): HeaderInfo {
  const scan = Math.min(HEADER_SCAN_ROWS, grid.length)
  const textCounts: number[] = []
  for (let r = 0; r < scan; r++) {
    const row = grid[r] ?? []
    const texts = row.filter((c) => c.length > 0 && !isNumericLike(c) && c.length <= 60)
    const distinct = new Set(texts.map((t) => t.toLowerCase())).size
    textCounts.push(distinct)
  }
  const maxText = Math.max(0, ...textCounts)
  let headerRow = -1
  // A row with at least two typical column titles wins (skips company name / phone lines on top).
  let bestHits = 1
  for (let r = 0; r < scan; r++) {
    const hits = headerWordHits(grid[r] ?? [])
    if (hits >= bestHits && hits >= 2) {
      bestHits = hits
      headerRow = r
    }
  }
  if (headerRow < 0 && maxText >= 2) {
    for (let r = 0; r < scan; r++) {
      const count = textCounts[r]!
      if (count < 2 || count < Math.ceil(maxText * 0.6)) continue
      if (consistency(grid, r) >= 0.5) {
        headerRow = r
        break
      }
    }
  }
  const headers: string[] = []
  for (let c = 0; c < width; c++) {
    const h = headerRow >= 0 ? (grid[headerRow]?.[c] ?? '').trim() : ''
    headers.push(h.length > 0 ? h : columnLetter(c))
  }
  return { headerRow, headers }
}

/** Fraction of the header's filled columns that are also filled in the next rows. */
function consistency(grid: string[][], r: number): number {
  const header = grid[r] ?? []
  const cols = header.map((c, i) => (c.length > 0 ? i : -1)).filter((i) => i >= 0)
  const following = grid.slice(r + 1, r + 6).filter((row) => row.some((c) => c.length > 0))
  if (following.length === 0) return 1 // a header with no data yet is still a header
  let hits = 0
  let total = 0
  for (const row of following) {
    for (const c of cols) {
      total++
      if ((row[c] ?? '').length > 0) hits++
    }
  }
  return total === 0 ? 0 : hits / total
}

/** Choose the column whose header looks like a product name; else the first mostly-text column. */
export function detectNameColumn(
  headers: string[],
  dataRows: string[][],
  hasHeaderRow: boolean
): number | null {
  if (hasHeaderRow) {
    let best = -1
    let bestScore = 0
    headers.forEach((h, i) => {
      const n = normalize(h)
      let score = 0
      if (NAME_N.some((w) => n.includes(w))) score += 2
      if (ITEM_N.some((w) => n.includes(w))) score += 2
      if (DESC_N.some((w) => n.includes(w))) score += 1
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    })
    if (best >= 0) return best
  }
  const sample = dataRows.slice(0, 50)
  if (sample.length === 0) return null
  for (let c = 0; c < headers.length; c++) {
    let text = 0
    let filled = 0
    for (const row of sample) {
      const v = row[c] ?? ''
      if (v.length === 0) continue
      filled++
      if (!isNumericLike(v)) text++
    }
    if (filled > 0 && text / sample.length >= 0.6) return c
  }
  return null
}

export interface DataRow {
  rowNum: number
  cells: string[]
}

/**
 * Group option rows under their product. Price lists often write the product name once (merged
 * cell or blank cells below it) followed by one row per option (sofa, armchair, 2+3 …).
 * - an empty name cell directly below a named row inherits that name (cells are updated in place);
 * - consecutive rows with the same name form a block.
 * Returns, per row, the row number where its block starts, or null for single-row products.
 */
export function assignBlocks(rows: DataRow[], nameCol: number | null): (number | null)[] {
  const out: (number | null)[] = rows.map(() => null)
  if (nameCol === null) return out
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!
    const prev = rows[i - 1]!
    const prevName = prev.cells[nameCol] ?? ''
    if (!(row.cells[nameCol] ?? '') && prevName && row.rowNum === prev.rowNum + 1) {
      while (row.cells.length <= nameCol) row.cells.push('')
      row.cells[nameCol] = prevName
    }
  }
  let start = 0
  for (let i = 1; i <= rows.length; i++) {
    const cur = rows[i]
    const prev = rows[i - 1]!
    const name = prev.cells[nameCol] ?? ''
    const continues =
      cur !== undefined && name !== '' && (cur.cells[nameCol] ?? '') === name && cur.rowNum === prev.rowNum + 1
    if (continues) continue
    if (i - start >= 2) for (let k = start; k < i; k++) out[k] = rows[start]!.rowNum
    start = i
  }
  return out
}
