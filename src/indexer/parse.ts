import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import * as XLSX from 'xlsx'
import * as cptable from 'xlsx/dist/cpexcel'
import type { FileErrorKey } from '../shared/types'

XLSX.set_cptable(cptable)

export interface ParsedSheet {
  name: string
  hidden: boolean
  /** Formatted cell text, row-major. Header-area merged cells are filled in. */
  grid: string[][]
  width: number
}

export class ParseError extends Error {
  constructor(
    public readonly key: FileErrorKey,
    message: string
  ) {
    super(message)
  }
}

/** Header detection only looks at the top rows; merged values are propagated there. */
const MERGE_FILL_ROWS = 15

/**
 * Read a file's bytes WITHOUT ever writing to it. If the file is locked (e.g. open in Excel on
 * Windows), copy it to a temp file first and read the copy.
 */
export async function readFileShared(path: string): Promise<Buffer> {
  try {
    return await fs.readFile(path)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'EACCES') throw err
    const tmp = join(tmpdir(), `ff-${randomUUID()}${extname(path)}`)
    try {
      await fs.copyFile(path, tmp)
      return await fs.readFile(tmp)
    } finally {
      await fs.rm(tmp, { force: true })
    }
  }
}

/** Decode a CSV: UTF-8 (with or without BOM), else the best of Windows-1255 / Windows-1256. */
export function decodeCsv(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    // not UTF-8 → legacy code page
  }
  const he = new TextDecoder('windows-1255').decode(buf)
  const ar = new TextDecoder('windows-1256').decode(buf)
  const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length
  const heScore = count(he, /[א-ת]/g)
  const arScore = count(ar, /[ء-ي]/g)
  return arScore > heScore ? ar : he
}

function friendlyError(err: unknown): ParseError {
  const msg = err instanceof Error ? err.message : String(err)
  if (/password/i.test(msg)) return new ParseError('password', msg)
  if (/ENOENT|EACCES|EPERM|EBUSY/i.test(msg)) return new ParseError('unreadable', msg)
  return new ParseError('corrupt', msg)
}

const cellText = (cell: XLSX.CellObject | undefined): string => {
  if (!cell) return ''
  if (cell.t === 'z' || cell.t === 'e') return ''
  const raw = cell.w ?? (cell.v === undefined || cell.v === null ? '' : String(cell.v))
  return raw.replace(/\s+/g, ' ').trim()
}

export function parseBuffer(buf: Buffer, fileName: string): ParsedSheet[] {
  const ext = extname(fileName).toLowerCase()
  let wb: XLSX.WorkBook
  try {
    const opts: XLSX.ParsingOptions = {
      cellText: true,
      cellDates: true,
      dense: true,
      cellHTML: false,
      cellFormula: false,
      cellStyles: false,
      sheetStubs: false,
      WTF: false
    }
    wb = ext === '.csv' ? XLSX.read(decodeCsv(buf), { ...opts, type: 'string', raw: false }) : XLSX.read(buf, { ...opts, type: 'buffer' })
  } catch (err) {
    throw friendlyError(err)
  }
  if (!wb.SheetNames || wb.SheetNames.length === 0) throw new ParseError('empty', 'no sheets')

  const sheets: ParsedSheet[] = []
  wb.SheetNames.forEach((name, i) => {
    const ws = wb.Sheets[name]
    if (!ws) return
    const hidden = (wb.Workbook?.Sheets?.[i]?.Hidden ?? 0) !== 0
    const data = (ws['!data'] ?? []) as (XLSX.CellObject[] | undefined)[]
    const grid: string[][] = []
    let width = 0
    for (let r = 0; r < data.length; r++) {
      const row = data[r]
      const out: string[] = []
      if (row) {
        for (let c = 0; c < row.length; c++) out.push(cellText(row[c]))
      }
      while (out.length > 0 && out[out.length - 1] === '') out.pop()
      if (out.length > width) width = out.length
      grid.push(out)
    }
    for (const m of ws['!merges'] ?? []) {
      if (m.s.r >= MERGE_FILL_ROWS) continue
      const v = grid[m.s.r]?.[m.s.c] ?? ''
      if (!v) continue
      for (let r = m.s.r; r <= Math.min(m.e.r, MERGE_FILL_ROWS - 1); r++) {
        const row = grid[r] ?? (grid[r] = [])
        for (let c = m.s.c; c <= m.e.c; c++) {
          while (row.length <= c) row.push('')
          if (!row[c]) row[c] = v
          if (row.length > width) width = row.length
        }
      }
    }
    sheets.push({ name, hidden, grid, width })
  })
  return sheets
}

export async function parseFile(path: string): Promise<ParsedSheet[]> {
  let buf: Buffer
  try {
    buf = await readFileShared(path)
  } catch (err) {
    throw new ParseError('unreadable', (err as Error).message)
  }
  if (buf.length === 0) throw new ParseError('empty', 'empty file')
  return parseBuffer(buf, basename(path))
}
