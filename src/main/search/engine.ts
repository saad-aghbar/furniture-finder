import type { Statement } from 'better-sqlite3'
import { charLength, normalizeWithMap, type NormalizedText } from '../../shared/normalize'
import type { BlockOption, Highlight, ResultCell, ScopeItem, SearchResult } from '../../shared/types'
import type { DB } from '../../indexer/db'
import { buildMatch, fuzzyDistance, likeEscape, parseQuery, shortGroups, type TermGroup } from './query'

/** Candidates ranked in JS. */
const CANDIDATES = 1000
/** Extra candidates whose title starts with a search word (only when matches are capped). */
const PREFIX_CANDIDATES = 200
const MIN_RESULTS_BEFORE_FUZZY = 5
const MAX_FUZZY_ALTERNATIVES = 12

export interface SearchOptions {
  limit: number
  fuzzy: boolean
  /** null = all sheets; otherwise only these sheet ids. */
  sheetIds: number[] | null
  recentlyCopied?: ReadonlySet<string>
  offlineSources?: ReadonlySet<string>
}

export interface EngineResult {
  results: SearchResult[]
  total: number
  capped: boolean
  fuzzyUsed: boolean
}

interface SheetMeta {
  name: string
  /** Empty strings when the sheet has no header row (column letters are not shown). */
  headers: string[]
  nameCol: number | null
  filePath: string
  fileName: string
  sourcePath: string
}

interface Candidate {
  id: number
  sheet_id: number
  row_num: number
  cells_json: string
  block_start: number | null
}

/** Most options shown for one product card. */
const MAX_BLOCK_ROWS = 60

export const rowKey = (filePath: string, sheet: string, rowNum: number): string =>
  `${filePath}\u0000${sheet}\u0000${rowNum}`

/** Search over the SQLite index. Read-only; safe to use while the indexer writes (WAL). */
export class SearchEngine {
  private sheetCache = new Map<number, SheetMeta>()
  private vocab: Map<number, string[]> | null = null
  private sheetStmt: Statement
  private vocabStmt: Statement
  private stmtCache = new Map<string, Statement>()

  constructor(private readonly db: DB) {
    this.sheetStmt = db.prepare(
      `SELECT s.name, s.headers_json, s.header_row, s.name_col, f.path AS file_path, f.name AS file_name, src.path AS source_path
       FROM sheets s JOIN files f ON f.id = s.file_id JOIN sources src ON src.id = f.source_id WHERE s.id = ?`
    )
    this.vocabStmt = db.prepare('SELECT token FROM vocab')
  }

  /** Call after the index changed. */
  invalidate(): void {
    this.sheetCache.clear()
    this.vocab = null
  }

  private prepare(sql: string): Statement {
    let st = this.stmtCache.get(sql)
    if (!st) {
      st = this.db.prepare(sql)
      this.stmtCache.set(sql, st)
    }
    return st
  }

  private sheet(id: number): SheetMeta | null {
    let meta = this.sheetCache.get(id)
    if (!meta) {
      const row = this.sheetStmt.get(id) as
        | { name: string; headers_json: string; header_row: number | null; name_col: number | null; file_path: string; file_name: string; source_path: string }
        | undefined
      if (!row) return null
      meta = {
        name: row.name,
        headers: row.header_row === null ? [] : (JSON.parse(row.headers_json) as string[]),
        nameCol: row.name_col,
        filePath: row.file_path,
        fileName: row.file_name,
        sourcePath: row.source_path
      }
      this.sheetCache.set(id, meta)
    }
    return meta
  }

  /** Expand a persisted scope selection to sheet ids (null = everything). */
  resolveScope(scope: ScopeItem[]): number[] | null {
    if (scope.length === 0) return null
    const ids = new Set<number>()
    const bySource = this.prepare(
      `SELECT s.id FROM sheets s JOIN files f ON f.id = s.file_id JOIN sources src ON src.id = f.source_id WHERE src.path = ?`
    )
    const byFile = this.prepare(`SELECT s.id FROM sheets s JOIN files f ON f.id = s.file_id WHERE f.path = ?`)
    const bySheet = this.prepare(
      `SELECT s.id FROM sheets s JOIN files f ON f.id = s.file_id WHERE f.path = ? AND s.name = ?`
    )
    for (const item of scope) {
      const rows =
        item.type === 'source'
          ? bySource.all(item.path)
          : item.type === 'file'
            ? byFile.all(item.path)
            : bySheet.all(item.path, item.sheet)
      for (const r of rows as { id: number }[]) ids.add(r.id)
    }
    return [...ids]
  }

  search(query: string, opts: SearchOptions): EngineResult {
    const groups = parseQuery(query)
    if (groups.length === 0) return { results: [], total: 0, capped: false, fuzzyUsed: false }
    const exact = this.run(groups, opts, false)
    if (!opts.fuzzy || exact.total >= MIN_RESULTS_BEFORE_FUZZY) return { ...exact, fuzzyUsed: false }

    const expanded = this.expandFuzzy(groups)
    if (!expanded) return { ...exact, fuzzyUsed: false }
    const similar = this.run(expanded, opts, true)
    const seen = new Set(exact.results.map((r) => r.rowId))
    const extra = similar.results.filter((r) => !seen.has(r.rowId))
    const results = [...exact.results, ...extra].slice(0, opts.limit)
    return {
      results,
      total: exact.total + extra.length,
      capped: exact.capped || similar.capped,
      fuzzyUsed: extra.length > 0
    }
  }

  private loadVocab(): Map<number, string[]> {
    if (!this.vocab) {
      const byLen = new Map<number, string[]>()
      for (const { token } of this.vocabStmt.iterate() as Iterable<{ token: string }>) {
        const len = charLength(token)
        let arr = byLen.get(len)
        if (!arr) byLen.set(len, (arr = []))
        arr.push(token)
      }
      this.vocab = byLen
    }
    return this.vocab
  }

  /** Add similarly-spelt indexed words as alternatives for terms of ≥ 4 letters. */
  private expandFuzzy(groups: TermGroup[]): TermGroup[] | null {
    let changed = false
    const vocab = this.loadVocab()
    const out = groups.map((g) => {
      const term = g.original
      const len = charLength(term)
      // Codes and numbers must match exactly or by prefix – never "similar".
      if (g.phrase || len < 4 || /\d/.test(term)) return g
      const max = len <= 7 ? 1 : 2
      const found: { token: string; d: number }[] = []
      for (let l = len - max; l <= len + max + 4; l++) {
        for (const token of vocab.get(l) ?? []) {
          if (token === term) continue
          const d = fuzzyDistance(term, token, max)
          if (d <= max) found.push({ token, d })
        }
      }
      if (found.length === 0) return g
      changed = true
      found.sort((a, b) => a.d - b.d || a.token.length - b.token.length)
      const alts = [term, ...found.slice(0, MAX_FUZZY_ALTERNATIVES).map((f) => f.token)]
      return { ...g, alternatives: alts }
    })
    return changed ? out : null
  }

  private run(groups: TermGroup[], opts: SearchOptions, similar: boolean): EngineResult {
    const empty = { results: [], total: 0, capped: false, fuzzyUsed: false }
    if (opts.sheetIds && opts.sheetIds.length === 0) return empty
    const match = buildMatch(groups)
    const where: string[] = []
    const params: unknown[] = []
    // CROSS JOIN forces SQLite to stream FTS matches (in rowid order) and stop at the LIMIT.
    // We deliberately do not ORDER BY bm25: ranking every match of a common word costs
    // hundreds of ms on 500k rows; candidates are ranked in JS instead (see DECISIONS.md).
    let sql = match
      ? 'SELECT r.id, r.sheet_id, r.row_num, r.cells_json, r.block_start FROM rows_fts f CROSS JOIN rows r ON r.id = f.rowid'
      : 'SELECT r.id, r.sheet_id, r.row_num, r.cells_json, r.block_start FROM rows r'
    if (match) {
      where.push('rows_fts MATCH ?')
      params.push(match)
    }
    for (const g of shortGroups(groups)) {
      where.push(`(${g.alternatives.map(() => `r.norm_text LIKE ? ESCAPE '\\'`).join(' OR ')})`)
      for (const a of g.alternatives) params.push(`%${likeEscape(a)}%`)
    }
    const scopeSql = 'r.sheet_id IN (SELECT value FROM json_each(?))'
    if (opts.sheetIds) {
      where.push(scopeSql)
      params.push(JSON.stringify(opts.sheetIds))
    }
    sql += ` WHERE ${where.join(' AND ')} LIMIT ${CANDIDATES + 1}`

    let rows: Candidate[]
    try {
      rows = this.prepare(sql).all(...params) as Candidate[]
    } catch {
      // A malformed MATCH expression must never break the search box.
      return empty
    }
    const capped = rows.length > CANDIDATES
    if (capped) {
      rows.length = CANDIDATES
      // Too many matches to rank them all: make sure rows whose product name STARTS with a
      // search word are among the candidates, wherever they are in the files.
      const seen = new Set(rows.map((r) => r.id))
      const prefixSql =
        'SELECT r.id, r.sheet_id, r.row_num, r.cells_json, r.block_start FROM rows r WHERE r.title_norm >= ? AND r.title_norm < ?' +
        (opts.sheetIds ? ` AND ${scopeSql}` : '') +
        ` LIMIT ${PREFIX_CANDIDATES}`
      const st = this.prepare(prefixSql)
      for (const g of groups) {
        for (const alt of g.alternatives) {
          const p: unknown[] = [alt, `${alt}\uffff`]
          if (opts.sheetIds) p.push(JSON.stringify(opts.sheetIds))
          for (const r of st.all(...p) as Candidate[]) {
            if (!seen.has(r.id)) {
              seen.add(r.id)
              rows.push(r)
            }
          }
        }
      }
    }

    const scored: { r: SearchResult; c: Candidate }[] = []
    for (const row of rows) {
      const meta = this.sheet(row.sheet_id)
      if (!meta) continue
      const r = scoreRow(row, meta, groups, opts, similar)
      if (r) scored.push({ r, c: row })
    }
    scored.sort((a, b) => b.r.score - a.r.score || a.r.rowId - b.r.rowId)

    // One card per product: option rows of the same block collapse into the best-scoring one,
    // which then carries every option of that product (matching ones flagged).
    const cards: SearchResult[] = []
    const byBlock = new Map<string, SearchResult>()
    for (const { r, c } of scored) {
      if (c.block_start === null) {
        cards.push(r)
        continue
      }
      const key = `${c.sheet_id}:${c.block_start}`
      const card = byBlock.get(key)
      if (card) {
        const opt = card.block?.options.find((o) => o.rowId === r.rowId)
        if (opt) opt.matched = true
        continue
      }
      if (cards.length < opts.limit) {
        const meta = this.sheet(c.sheet_id)!
        r.block = { start: c.block_start, options: this.loadBlock(c.sheet_id, c.block_start, meta, groups, r.rowId) }
      }
      byBlock.set(key, r)
      cards.push(r)
    }
    return { results: cards.slice(0, opts.limit), total: cards.length, capped, fuzzyUsed: false }
  }

  private loadBlock(sheetId: number, start: number, meta: SheetMeta, groups: TermGroup[], matchedId: number): BlockOption[] {
    const rows = this.prepare(
      `SELECT id, row_num, cells_json FROM rows WHERE sheet_id = ? AND block_start = ? ORDER BY row_num LIMIT ${MAX_BLOCK_ROWS}`
    ).all(sheetId, start) as { id: number; row_num: number; cells_json: string }[]
    return rows.map((row) => ({
      rowId: row.id,
      rowNum: row.row_num,
      cells: highlightCells(JSON.parse(row.cells_json) as string[], meta, groups),
      matched: row.id === matchedId
    }))
  }
}

interface CellMatch {
  score: number
  ranges: [number, number][]
}

const isBoundary = (text: string, i: number): boolean => i === 0 || text[i - 1] === ' '

/** Score one alternative against one normalised cell. */
function matchCell(norm: string, compact: string, alt: string): CellMatch | null {
  const ranges: [number, number][] = []
  let best = 0
  let from = 0
  for (;;) {
    const i = norm.indexOf(alt, from)
    if (i < 0) break
    ranges.push([i, i + alt.length])
    const end = i + alt.length
    let s = 30
    if (norm === alt) s = 100
    else if (isBoundary(norm, i)) s = end === norm.length || norm[end] === ' ' ? 75 : 60
    if (s > best) best = s
    from = i + 1
  }
  if (ranges.length) return { score: best, ranges }
  // Codes typed without separators ("a123" for "A-12/3"): highlight the whole code token.
  if (compact.includes(alt)) {
    let pos = 0
    for (const tok of norm.split(' ')) {
      if (tok.replace(/[-/.]/g, '').includes(alt)) ranges.push([pos, pos + tok.length])
      pos += tok.length + 1
    }
    return { score: 50, ranges }
  }
  return null
}

function scoreRow(
  row: Candidate,
  meta: SheetMeta,
  groups: TermGroup[],
  opts: SearchOptions,
  similar: boolean
): SearchResult | null {
  const raw = JSON.parse(row.cells_json) as string[]
  const maps: (NormalizedText | null)[] = raw.map((c) => (c ? normalizeWithMap(c) : null))
  const compacts = maps.map((m) => (m ? m.text.replace(/[-/.]/g, '') : ''))
  const cellRanges = new Map<number, [number, number][]>()
  let score = 0
  const cellsPerGroup: Set<number>[] = []
  let bestCell = -1
  let bestCellScore = -1

  for (const g of groups) {
    let groupBest = 0
    const cells = new Set<number>()
    maps.forEach((m, col) => {
      if (!m) return
      for (const alt of g.alternatives) {
        const hit = matchCell(m.text, compacts[col]!, alt)
        if (!hit) continue
        cells.add(col)
        const list = cellRanges.get(col) ?? []
        list.push(...hit.ranges)
        cellRanges.set(col, list)
        let s = hit.score
        if (alt !== g.original) s *= 0.6 // a similar spelling is worth less than the real thing
        if (col === meta.nameCol) s += 25
        if (s > groupBest) groupBest = s
        if (s > bestCellScore) {
          bestCellScore = s
          bestCell = col
        }
      }
    })
    if (cells.size === 0) return null // false positive (match spanned two cells)
    cellsPerGroup.push(cells)
    score += groupBest
  }
  if (groups.length > 1) {
    const first = cellsPerGroup[0]!
    for (const col of first) {
      if (cellsPerGroup.every((s) => s.has(col))) {
        score += 20
        break
      }
    }
  }
  if (opts.recentlyCopied?.has(rowKey(meta.filePath, meta.name, row.row_num))) score += 10

  const mkCell = (col: number): ResultCell => {
    const value = raw[col] ?? ''
    const map = maps[col]
    const highlights: Highlight[] = []
    if (map) {
      const merged = mergeRanges(cellRanges.get(col) ?? [])
      for (const [s, e] of merged) {
        const start = map.starts[s]
        const end = map.ends[e - 1]
        if (start !== undefined && end !== undefined && end > start) highlights.push({ start, end })
      }
    }
    return { col, header: meta.headers[col] ?? '', value, highlights }
  }

  const titleCol = meta.nameCol !== null && raw[meta.nameCol] ? meta.nameCol : bestCell
  const cells: ResultCell[] = []
  raw.forEach((v, col) => {
    if (v) cells.push(mkCell(col))
  })
  const title = cells.find((c) => c.col === titleCol) ?? cells[0]!
  return {
    rowId: row.id,
    filePath: meta.filePath,
    fileName: meta.fileName,
    sheetName: meta.name,
    rowNum: row.row_num,
    title,
    details: cells.filter((c) => c.col !== title.col),
    cells,
    score,
    similar,
    offline: opts.offlineSources?.has(meta.sourcePath) ?? false
  }
}

/** All non-empty cells of a row with highlights for every query word (used for product options). */
function highlightCells(raw: string[], meta: SheetMeta, groups: TermGroup[]): ResultCell[] {
  const out: ResultCell[] = []
  raw.forEach((value, col) => {
    if (!value) return
    const map = normalizeWithMap(value)
    const compact = map.text.replace(/[-/.]/g, '')
    const ranges: [number, number][] = []
    for (const g of groups) for (const alt of g.alternatives) ranges.push(...(matchCell(map.text, compact, alt)?.ranges ?? []))
    const highlights: Highlight[] = []
    for (const [s, e] of mergeRanges(ranges)) {
      const start = map.starts[s]
      const end = map.ends[e - 1]
      if (start !== undefined && end !== undefined && end > start) highlights.push({ start, end })
    }
    out.push({ col, header: meta.headers[col] ?? '', value, highlights })
  })
  return out
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length <= 1) return ranges
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = [sorted[0]!]
  for (const r of sorted.slice(1)) {
    const last = out[out.length - 1]!
    if (r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else out.push([r[0], r[1]])
  }
  return out
}
