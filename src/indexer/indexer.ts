import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import { fuzzyTokens, indexText, normalize } from '../shared/normalize'
import type { FileErrorKey, FileStatus } from '../shared/types'
import type { DB } from './db'
import { detectHeader, detectNameColumn } from './headers'
import { ParseError, parseBuffer, readFileShared } from './parse'

const MAX_COLS = 200
const MAX_CELL = 2000
const BATCH = 2000

export interface SourceRecord {
  path: string
  kind: 'folder' | 'file'
  addedAt: number
  status: 'ok' | 'offline' | 'error'
}

export interface FileStat {
  path: string
  size: number
  mtime: number
}

export interface IndexOutcome extends FileStatus {
  skipped: boolean
}

interface FileRow {
  id: number
  size: number
  mtime: number
  hash: string | null
  status: string
  error: string | null
}

/** All index writes. Used by the indexing worker (and directly by tests). */
export class Indexer {
  private stmts

  constructor(private readonly db: DB) {
    this.stmts = {
      upsertSource: db.prepare(
        `INSERT INTO sources(kind, path, added_at, status) VALUES (@kind, @path, @addedAt, @status)
         ON CONFLICT(path) DO UPDATE SET kind = excluded.kind, status = excluded.status`
      ),
      sourceId: db.prepare('SELECT id FROM sources WHERE path = ?'),
      allSources: db.prepare('SELECT id, path FROM sources'),
      deleteSource: db.prepare('DELETE FROM sources WHERE id = ?'),
      fileByPath: db.prepare(
        'SELECT id, size, mtime, hash, status, error FROM files WHERE path = ?'
      ),
      filesOfSource: db.prepare('SELECT id, path FROM files WHERE source_id = ?'),
      insertFile: db.prepare(
        `INSERT INTO files(source_id, path, name, size, mtime, status) VALUES (?, ?, ?, ?, ?, 'pending')
         ON CONFLICT(path) DO UPDATE SET source_id = excluded.source_id`
      ),
      updateFile: db.prepare(
        `UPDATE files SET size = ?, mtime = ?, hash = ?, indexed_at = ?, status = ?, error = ? WHERE id = ?`
      ),
      touchFile: db.prepare('UPDATE files SET size = ?, mtime = ? WHERE id = ?'),
      deleteFile: db.prepare('DELETE FROM files WHERE id = ?'),
      markIndexing: db.prepare("UPDATE files SET status = 'indexing' WHERE id = ?"),
      deleteSheets: db.prepare('DELETE FROM sheets WHERE file_id = ?'),
      insertSheet: db.prepare(
        `INSERT INTO sheets(file_id, name, idx, hidden, header_row, headers_json, name_col)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ),
      insertRow: db.prepare(
        `INSERT INTO rows(sheet_id, row_num, cells_json, display_title, title_norm, norm_text) VALUES (?, ?, ?, ?, ?, ?)`
      ),
      insertToken: db.prepare('INSERT OR IGNORE INTO vocab(token) VALUES (?)'),
      fileCounts: db.prepare(
        `SELECT (SELECT COUNT(*) FROM sheets WHERE file_id = @id) AS sheets,
                (SELECT COUNT(*) FROM rows r JOIN sheets s ON s.id = r.sheet_id WHERE s.file_id = @id) AS rows`
      )
    }
  }

  /** Make the sources table match the configured list exactly. */
  syncSources(sources: SourceRecord[]): void {
    const keep = new Set(sources.map((s) => s.path))
    this.db.transaction(() => {
      for (const s of sources) this.stmts.upsertSource.run(s)
      for (const row of this.stmts.allSources.all() as { id: number; path: string }[]) {
        if (!keep.has(row.path)) this.stmts.deleteSource.run(row.id)
      }
    })()
  }

  /**
   * Given the complete current list of files of a source, remove index entries of files that no
   * longer exist and return the files that need (re)indexing checks.
   */
  reconcileSource(sourcePath: string, present: FileStat[]): void {
    const src = this.stmts.sourceId.get(sourcePath) as { id: number } | undefined
    if (!src) return
    const keep = new Set(present.map((f) => f.path))
    this.db.transaction(() => {
      for (const row of this.stmts.filesOfSource.all(src.id) as { id: number; path: string }[]) {
        if (!keep.has(row.path)) this.stmts.deleteFile.run(row.id)
      }
    })()
  }

  removeFiles(paths: string[]): void {
    this.db.transaction(() => {
      for (const p of paths) {
        const row = this.stmts.fileByPath.get(p) as FileRow | undefined
        if (row) this.stmts.deleteFile.run(row.id)
      }
    })()
  }

  /** After a crash: files left in 'indexing' state crashed the parser – report them as damaged. */
  recoverCrashed(): number {
    return this.db.prepare("UPDATE files SET status = 'error', error = 'corrupt' WHERE status = 'indexing'").run().changes
  }

  hasSource(path: string): boolean {
    return this.stmts.sourceId.get(path) !== undefined
  }

  /** Remove every indexed file below a folder (folder deleted or renamed). */
  removeUnder(dir: string): void {
    const prefix = dir.endsWith('/') || dir.endsWith('\\') ? dir : dir + (dir.includes('\\') ? '\\' : '/')
    const rows = this.db
      .prepare("SELECT id FROM files WHERE substr(path, 1, ?) = ?")
      .all(prefix.length, prefix) as { id: number }[]
    this.db.transaction(() => {
      for (const r of rows) this.stmts.deleteFile.run(r.id)
    })()
  }

  /** Cheap check (size + mtime) whether a file might need re-indexing. */
  needsCheck(stat: FileStat): boolean {
    const row = this.stmts.fileByPath.get(stat.path) as FileRow | undefined
    if (!row) return true
    if (row.status === 'pending') return true
    return row.size !== stat.size || row.mtime !== stat.mtime
  }

  /**
   * Index one file. Reads it read-only; skips work when the content hash is unchanged.
   * Everything for the file happens in one transaction, so searches never see half a file.
   */
  async indexFile(
    sourcePath: string,
    stat: FileStat,
    opts: { force?: boolean; onRows?: (rowsSoFar: number) => void } = {}
  ): Promise<IndexOutcome> {
    const name = basename(stat.path)
    const src = this.stmts.sourceId.get(sourcePath) as { id: number } | undefined
    if (!src) throw new Error(`unknown source ${sourcePath}`)
    this.stmts.insertFile.run(src.id, stat.path, name, stat.size, stat.mtime)
    const existing = this.stmts.fileByPath.get(stat.path) as FileRow

    let buf: Buffer
    try {
      buf = await readFileShared(stat.path)
    } catch (err) {
      return this.markError(existing.id, stat, null, 'unreadable', name, (err as Error).message)
    }
    const hash = createHash('sha1').update(buf).digest('hex')
    if (!opts.force && existing.hash === hash && existing.status !== 'pending') {
      this.stmts.touchFile.run(stat.size, stat.mtime, existing.id)
      const counts = this.stmts.fileCounts.get({ id: existing.id }) as { sheets: number; rows: number }
      return {
        path: stat.path,
        name,
        status: existing.status === 'ok' ? 'ok' : 'error',
        error: (existing.error as FileErrorKey | null) ?? undefined,
        rows: counts.rows,
        sheets: counts.sheets,
        skipped: true
      }
    }
    if (buf.length === 0) return this.markError(existing.id, stat, hash, 'empty', name, 'empty')

    // Mark the file as "being read": if parsing crashes the worker, the next start reports this
    // file as damaged instead of trying it again forever.
    this.stmts.markIndexing.run(existing.id)
    let sheets
    try {
      sheets = parseBuffer(buf, name)
    } catch (err) {
      const key = err instanceof ParseError ? err.key : 'corrupt'
      return this.markError(existing.id, stat, hash, key, name, (err as Error).message)
    }

    let rowCount = 0
    const tokens = new Set<string>()
    this.db.transaction(() => {
      this.stmts.deleteSheets.run(existing.id)
      sheets.forEach((sheet, idx) => {
        const width = Math.min(sheet.width, MAX_COLS)
        const { headerRow, headers } = detectHeader(sheet.grid, width)
        const start = headerRow + 1
        const headerKey = headerRow >= 0 ? (sheet.grid[headerRow] ?? []).join('\u0000') : null
        const dataRows: { rowNum: number; cells: string[] }[] = []
        for (let r = start; r < sheet.grid.length; r++) {
          const row = sheet.grid[r] ?? []
          if (!row.some((c) => c.length > 0)) continue
          if (headerKey !== null && row.join('\u0000') === headerKey) continue
          dataRows.push({
            rowNum: r + 1,
            cells: row.slice(0, MAX_COLS).map((c) => (c.length > MAX_CELL ? c.slice(0, MAX_CELL) : c))
          })
        }
        const nameCol = detectNameColumn(headers, dataRows.slice(0, 50).map((d) => d.cells), headerRow >= 0)
        const sheetId = this.stmts.insertSheet.run(
          existing.id,
          sheet.name,
          idx,
          sheet.hidden ? 1 : 0,
          headerRow >= 0 ? headerRow + 1 : null,
          JSON.stringify(headers),
          nameCol
        ).lastInsertRowid as number
        for (const d of dataRows) {
          const title = (nameCol !== null ? d.cells[nameCol] : '') || d.cells.find((c) => c.length > 0) || ''
          const norm = indexText(d.cells)
          this.stmts.insertRow.run(sheetId, d.rowNum, JSON.stringify(d.cells), title, normalize(title), norm)
          for (const t of fuzzyTokens(norm)) tokens.add(t)
          rowCount++
          if (rowCount % BATCH === 0) opts.onRows?.(rowCount)
        }
      })
      for (const t of tokens) this.stmts.insertToken.run(t)
      this.stmts.updateFile.run(stat.size, stat.mtime, hash, Date.now(), 'ok', null, existing.id)
    })()
    opts.onRows?.(rowCount)
    return { path: stat.path, name, status: 'ok', rows: rowCount, sheets: sheets.length, skipped: false }
  }

  private markError(
    fileId: number,
    stat: FileStat,
    hash: string | null,
    key: FileErrorKey,
    name: string,
    _detail: string
  ): IndexOutcome {
    this.db.transaction(() => {
      this.stmts.deleteSheets.run(fileId)
      this.stmts.updateFile.run(stat.size, stat.mtime, hash, Date.now(), 'error', key, fileId)
    })()
    return { path: stat.path, name, status: 'error', error: key, rows: 0, sheets: 0, skipped: false }
  }
}

export async function statFile(path: string): Promise<FileStat | null> {
  try {
    const st = await fs.stat(path)
    if (!st.isFile()) return null
    return { path, size: st.size, mtime: Math.floor(st.mtimeMs) }
  } catch {
    return null
  }
}
