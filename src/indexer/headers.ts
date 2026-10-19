import { normalize } from '../shared/normalize'

/** Rows inspected when looking for the header row. */
const HEADER_SCAN_ROWS = 15

/** Header keywords that identify the "name-like" column, grouped by weight. */
const NAME_WORDS = ['name', 'title', 'שם', 'اسم', 'الاسم', 'البيان']
const ITEM_WORDS = ['product', 'item', 'model', 'מוצר', 'פריט', 'דגם', 'منتج', 'صنف', 'موديل']
const DESC_WORDS = ['description', 'desc', 'תיאור', 'وصف']

const normWords = (words: string[]): string[] => words.map((w) => normalize(w))
const NAME_N = normWords(NAME_WORDS)
const ITEM_N = normWords(ITEM_WORDS)
const DESC_N = normWords(DESC_WORDS)

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
  if (maxText >= 2) {
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
