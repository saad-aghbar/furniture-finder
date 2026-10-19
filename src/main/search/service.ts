import { basename, relative } from 'node:path'
import type { DB } from '../../indexer/db'
import type { FileStatus, FileErrorKey, ScopeItem, ScopeTreeSource, SearchRequest, SearchResponse } from '../../shared/types'
import { settings } from '../settings'
import { SearchEngine } from './engine'

/** Main-process search facade: caches scope resolution and the scope tree between index changes. */
export class SearchService {
  private engine: SearchEngine
  private scopeKey = ''
  private scopeIds: number[] | null = null
  private tree: ScopeTreeSource[] | null = null

  constructor(
    private readonly db: DB,
    private readonly offline: () => Set<string>
  ) {
    this.engine = new SearchEngine(db)
  }

  invalidate(): void {
    this.engine.invalidate()
    this.scopeKey = ''
    this.tree = null
  }

  private sheetIds(scope: ScopeItem[]): number[] | null {
    const key = JSON.stringify(scope)
    if (key !== this.scopeKey) {
      this.scopeIds = this.engine.resolveScope(scope)
      this.scopeKey = key
    }
    return this.scopeIds
  }

  search(req: SearchRequest): SearchResponse {
    const t0 = performance.now()
    const s = settings.all()
    const res = this.engine.search(req.query, {
      limit: req.limit ?? s.resultsPerPage,
      fuzzy: s.fuzzy,
      sheetIds: this.sheetIds(s.scope),
      recentlyCopied: new Set(s.recentlyCopied),
      offlineSources: this.offline()
    })
    return {
      seq: req.seq,
      query: req.query,
      results: res.results,
      total: res.total,
      capped: res.capped,
      tookMs: performance.now() - t0,
      fuzzyUsed: res.fuzzyUsed
    }
  }

  scopeTree(): ScopeTreeSource[] {
    if (this.tree) return this.tree
    const sources = this.db.prepare('SELECT id, path, kind, status FROM sources ORDER BY path').all() as {
      id: number
      path: string
      kind: 'folder' | 'file'
      status: 'ok' | 'offline' | 'error'
    }[]
    const files = this.db
      .prepare("SELECT id, source_id, path, name, status FROM files WHERE status = 'ok' ORDER BY path")
      .all() as { id: number; source_id: number; path: string; name: string; status: string }[]
    const sheets = this.db.prepare('SELECT id, file_id, name FROM sheets ORDER BY file_id, idx').all() as {
      id: number
      file_id: number
      name: string
    }[]
    const counts = new Map<number, number>()
    for (const r of this.db.prepare('SELECT sheet_id, COUNT(*) AS n FROM rows GROUP BY sheet_id').all() as {
      sheet_id: number
      n: number
    }[])
      counts.set(r.sheet_id, r.n)
    const offline = this.offline()
    this.tree = sources.map((src) => ({
      path: src.path,
      name: basename(src.path),
      kind: src.kind,
      status: offline.has(src.path) ? 'offline' : src.status,
      files: files
        .filter((f) => f.source_id === src.id)
        .map((f) => ({
          path: f.path,
          name: f.name,
          relPath: src.kind === 'folder' ? relative(src.path, f.path) : f.name,
          status: f.status,
          sheets: sheets.filter((sh) => sh.file_id === f.id).map((sh) => ({ name: sh.name, rows: counts.get(sh.id) ?? 0 }))
        }))
    }))
    return this.tree
  }

  /** Files that could not be read, for "Manage files" / Settings → Files. */
  errors(): FileStatus[] {
    const rows = this.db.prepare("SELECT path, name, error FROM files WHERE status = 'error' ORDER BY name").all() as {
      path: string
      name: string
      error: string | null
    }[]
    return rows.map((r) => ({
      path: r.path,
      name: r.name,
      status: 'error',
      error: (r.error as FileErrorKey | null) ?? 'corrupt',
      rows: 0,
      sheets: 0
    }))
  }
}
