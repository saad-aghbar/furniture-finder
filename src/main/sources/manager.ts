import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import { resolve, sep } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import { statFile } from '../../indexer/indexer'
import type { AddSourcesResult } from '../../shared/ipc'
import type { SourceEntry, SourceInfo } from '../../shared/types'
import type { IndexerHost } from '../indexer-host'
import { log } from '../log'
import { settings } from '../settings'
import { isIndexable, scanSource } from './scan'

const ONLINE_CHECK_MS = 30_000
const WATCH_DEBOUNCE_MS = 800

const isUnc = (p: string): boolean => p.startsWith('\\\\') || p.startsWith('//')

/** True when `child` is `parent` or inside it. */
export function isInside(child: string, parent: string): boolean {
  const c = resolve(child)
  const p = resolve(parent)
  if (c === p) return true
  const withSep = p.endsWith(sep) ? p : p + sep
  return process.platform === 'win32' ? c.toLowerCase().startsWith(withSep.toLowerCase()) : c.startsWith(withSep)
}

/**
 * Knows which folders/files the user added, scans them, watches them for changes and feeds the
 * indexing worker. Emits 'changed' (SourceInfo[]) whenever counts or online status change.
 */
export class SourceManager extends EventEmitter {
  private info = new Map<string, SourceInfo>()
  private watchers = new Map<string, FSWatcher>()
  private pendingChanged = new Map<string, string>() // file path → source path
  private pendingRemoved = new Map<string, string>()
  private pendingDirs = new Map<string, string>()
  private flushTimer: NodeJS.Timeout | null = null
  private onlineTimer: NodeJS.Timeout | null = null

  constructor(private readonly host: IndexerHost) {
    super()
  }

  private entries(): SourceEntry[] {
    return settings.get('sources')
  }

  list(): SourceInfo[] {
    return this.entries().map(
      (e) => this.info.get(e.path) ?? { ...e, status: 'ok', fileCount: 0, skippedCount: 0 }
    )
  }

  private emitChanged(): void {
    this.emit('changed', this.list())
  }

  private pushSources(): void {
    this.host.setSources(
      this.entries().map((e) => ({ ...e, status: this.info.get(e.path)?.status ?? 'ok' }))
    )
  }

  /** Called at start-up: scan everything in the background and start watching. */
  async start(): Promise<void> {
    this.pushSources()
    await this.rescanAll(false)
    this.onlineTimer = setInterval(() => void this.checkOnline(), ONLINE_CHECK_MS)
  }

  async rescanAll(force: boolean): Promise<void> {
    for (const e of this.entries()) await this.scanOne(e, force)
    this.updateWatchers()
  }

  private async scanOne(e: SourceEntry, force: boolean): Promise<void> {
    const res = await scanSource(e.path, e.kind)
    if (!res.exists) {
      // Unplugged drive / network folder: keep the last index and mark offline.
      const prev = this.info.get(e.path)
      this.info.set(e.path, { ...e, status: 'offline', fileCount: prev?.fileCount ?? 0, skippedCount: prev?.skippedCount ?? 0 })
      this.pushSources()
      this.emitChanged()
      return
    }
    this.info.set(e.path, { ...e, status: 'ok', fileCount: res.files.length, skippedCount: res.skipped })
    this.pushSources()
    this.host.scan(e.path, res.files, { complete: true, force })
    this.emitChanged()
  }

  async add(paths: string[]): Promise<AddSourcesResult> {
    const result: AddSourcesResult = { added: [], alreadyCovered: [], rejected: [] }
    let entries = [...this.entries()]
    for (const raw of paths) {
      const path = resolve(raw)
      let kind: 'folder' | 'file'
      try {
        const st = await fs.stat(path)
        if (st.isDirectory()) kind = 'folder'
        else if (st.isFile() && isIndexable(path)) kind = 'file'
        else {
          result.rejected.push(path)
          continue
        }
      } catch {
        result.rejected.push(path)
        continue
      }
      if (entries.some((e) => e.path === path || (e.kind === 'folder' && isInside(path, e.path)))) {
        result.alreadyCovered.push(path)
        continue
      }
      // A new folder replaces sources that are inside it.
      if (kind === 'folder') entries = entries.filter((e) => !isInside(e.path, path))
      const entry: SourceEntry = { path, kind, addedAt: Date.now() }
      entries.push(entry)
      settings.set({ sources: entries })
      this.pushSources()
      await this.scanOne(entry, false)
      result.added.push(this.info.get(path)!)
    }
    // Drop info of sources that were replaced.
    for (const key of [...this.info.keys()]) if (!entries.some((e) => e.path === key)) this.info.delete(key)
    this.pushSources()
    this.updateWatchers()
    this.emitChanged()
    log.info('sources added', result.added.map((a) => a.path))
    return result
  }

  remove(path: string): SourceInfo[] {
    const entries = this.entries().filter((e) => e.path !== path)
    settings.set({ sources: entries, scope: settings.get('scope').filter((s) => !isInside(s.path, path)) })
    this.info.delete(path)
    this.pushSources()
    this.updateWatchers()
    this.emitChanged()
    return this.list()
  }

  isOffline(path: string): boolean {
    return this.info.get(path)?.status === 'offline'
  }

  offlineSet(): Set<string> {
    return new Set([...this.info.values()].filter((i) => i.status === 'offline').map((i) => i.path))
  }

  private async checkOnline(): Promise<void> {
    for (const e of this.entries()) {
      const exists = await fs.stat(e.path).then(() => true, () => false)
      const was = this.info.get(e.path)?.status
      if (exists && was === 'offline') {
        log.info('source back online', e.path)
        await this.scanOne(e, false)
        this.updateWatchers()
      } else if (!exists && was !== 'offline') {
        log.info('source offline', e.path)
        await this.scanOne(e, false)
      }
    }
  }

  // ---------- watching ----------

  updateWatchers(): void {
    const want = settings.get('autoWatch')
      ? this.entries().filter((e) => this.info.get(e.path)?.status !== 'offline')
      : []
    const wantPaths = new Set(want.map((e) => e.path))
    for (const [path, w] of this.watchers) {
      if (!wantPaths.has(path)) {
        void w.close()
        this.watchers.delete(path)
      }
    }
    for (const e of want) {
      if (this.watchers.has(e.path)) continue
      const polling = isUnc(e.path)
      const w = watch(e.path, {
        ignoreInitial: true,
        persistent: true,
        followSymlinks: false,
        ignorePermissionErrors: true,
        usePolling: polling,
        interval: polling ? 4000 : undefined,
        binaryInterval: polling ? 4000 : undefined,
        awaitWriteFinish: { stabilityThreshold: 1200, pollInterval: 200 },
        ignored: (p, stats) => {
          const name = p.split(/[\\/]/).pop() ?? ''
          if (name.startsWith('~$') || (name.startsWith('.') && p !== e.path)) return true
          return stats?.isFile() === true && !isIndexable(p)
        }
      })
      w.on('add', (p) => this.queueChange(e.path, p))
      w.on('change', (p) => this.queueChange(e.path, p))
      w.on('unlink', (p) => this.queueRemove(e.path, p))
      w.on('unlinkDir', (p) => this.queueRemoveDir(e.path, p))
      w.on('error', (err) => log.warn('watcher error', e.path, err))
      this.watchers.set(e.path, w)
    }
  }

  private queueChange(source: string, path: string): void {
    if (!isIndexable(path)) return
    this.pendingRemoved.delete(path)
    this.pendingChanged.set(path, source)
    this.scheduleFlush()
  }

  private queueRemove(source: string, path: string): void {
    if (!isIndexable(path)) return
    this.pendingChanged.delete(path)
    this.pendingRemoved.set(path, source)
    this.scheduleFlush()
  }

  private queueRemoveDir(source: string, dir: string): void {
    this.pendingDirs.set(dir, source)
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => void this.flush(), WATCH_DEBOUNCE_MS)
  }

  private async flush(): Promise<void> {
    this.flushTimer = null
    const changed = [...this.pendingChanged]
    const removed = [...this.pendingRemoved]
    const dirs = [...this.pendingDirs]
    this.pendingChanged.clear()
    this.pendingRemoved.clear()
    this.pendingDirs.clear()

    // If the source root itself vanished, it is an unplugged drive – not a deletion.
    const rootAlive = new Map<string, boolean>()
    const alive = async (src: string): Promise<boolean> => {
      if (!rootAlive.has(src)) rootAlive.set(src, await fs.stat(src).then(() => true, () => false))
      return rootAlive.get(src)!
    }

    const bySource = new Map<string, { path: string; size: number; mtime: number }[]>()
    for (const [path, src] of changed) {
      const st = await statFile(path)
      if (!st) continue
      const list = bySource.get(src) ?? []
      list.push(st)
      bySource.set(src, list)
    }
    for (const [src, files] of bySource) this.host.scan(src, files, { complete: false })

    const gone: string[] = []
    for (const [path, src] of removed) {
      if (!(await alive(src))) continue
      if (await statFile(path)) continue // re-created meanwhile (save via temp file + rename)
      gone.push(path)
    }
    this.host.remove(gone)
    for (const [dir, src] of dirs) {
      if (!(await alive(src)) || dir === src) continue
      this.host.removeUnder(dir)
    }

    let offline = false
    for (const [src, ok] of rootAlive) if (!ok && !this.isOffline(src)) offline = true
    if (offline) await this.checkOnline()

    // Keep the per-source file counts roughly right without a full rescan.
    if (changed.length || removed.length || dirs.length) {
      for (const src of new Set([...changed, ...removed].map(([, s]) => s))) {
        const e = this.entries().find((x) => x.path === src)
        if (!e) continue
        const res = await scanSource(e.path, e.kind)
        if (res.exists) {
          this.info.set(e.path, { ...e, status: 'ok', fileCount: res.files.length, skippedCount: res.skipped })
        }
      }
      this.emitChanged()
    }
  }

  async stop(): Promise<void> {
    if (this.onlineTimer) clearInterval(this.onlineTimer)
    await Promise.all([...this.watchers.values()].map((w) => w.close()))
    this.watchers.clear()
  }
}
