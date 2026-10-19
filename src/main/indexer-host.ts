import { EventEmitter } from 'node:events'
import { Worker } from 'node:worker_threads'
import workerPath from '../indexer/worker?modulePath'
import type { FileStat, SourceRecord } from '../indexer/indexer'
import type { FromWorker, ToWorker } from '../indexer/protocol'
import type { FileStatus, IndexProgress } from '../shared/types'
import { log } from './log'

/**
 * Runs the indexing worker and keeps the current progress for the UI.
 * Events: 'progress' (IndexProgress), 'changed' (index content changed), 'idle'.
 */
export class IndexerHost extends EventEmitter {
  private worker: Worker | null = null
  private state: IndexProgress = {
    running: false,
    filesTotal: 0,
    filesDone: 0,
    rowsIndexed: 0,
    currentFile: null,
    errors: []
  }
  private changedTimer: NodeJS.Timeout | null = null

  constructor(private readonly dbPath: string) {
    super()
  }

  /** Start the worker; resolves once the database is open and migrated. */
  start(): Promise<{ rebuilt: boolean }> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(workerPath, { workerData: { dbPath: this.dbPath } })
      this.worker = worker
      let ready = false
      worker.on('message', (msg: FromWorker) => {
        if (msg.type === 'ready') {
          ready = true
          resolve({ rebuilt: msg.rebuilt })
        } else if (msg.type === 'fatal') {
          log.error('indexer fatal', msg.message)
          if (!ready) reject(new Error(msg.message))
        } else this.onMessage(msg)
      })
      worker.on('error', (err) => {
        log.error('indexer worker crashed', err)
        if (!ready) reject(err)
        else this.restart()
      })
      worker.on('exit', (code) => {
        if (code !== 0) log.warn('indexer worker exited', code)
      })
    })
  }

  private restart(): void {
    this.worker = null
    this.state = { ...this.state, running: false, currentFile: null }
    this.emit('progress', this.progress())
    void this.start().then(() => this.emit('restarted'))
  }

  private post(msg: ToWorker): void {
    this.worker?.postMessage(msg)
  }

  private onMessage(msg: FromWorker): void {
    switch (msg.type) {
      case 'progress': {
        const running = msg.filesTotal > 0 || msg.currentFile !== null
        if (running && !this.state.running) this.state.errors = []
        this.state = {
          ...this.state,
          running,
          filesTotal: msg.filesTotal,
          filesDone: msg.filesDone,
          rowsIndexed: msg.rowsIndexed,
          currentFile: msg.currentFile
        }
        this.emit('progress', this.progress())
        break
      }
      case 'fileDone':
        if (msg.outcome.status === 'error') {
          this.state.errors = [...this.state.errors.filter((e) => e.path !== msg.outcome.path), msg.outcome]
          log.warn('file could not be indexed', msg.outcome.path, msg.outcome.error)
        }
        break
      case 'changed':
        // Coalesce bursts of changes (many small files) into one UI refresh.
        if (!this.changedTimer) {
          this.changedTimer = setTimeout(() => {
            this.changedTimer = null
            this.emit('changed')
          }, 150)
        }
        break
      case 'idle':
        this.state = { ...this.state, running: false, currentFile: null }
        this.emit('progress', this.progress())
        this.emit('idle')
        break
    }
  }

  progress(): IndexProgress {
    return { ...this.state, errors: [...this.state.errors] }
  }

  setSources(sources: SourceRecord[]): void {
    this.post({ type: 'sources', sources })
  }

  scan(sourcePath: string, files: FileStat[], opts: { complete: boolean; force?: boolean }): void {
    if (files.length > 0 || opts.complete) {
      this.state.running = this.state.running || files.length > 0
    }
    this.post({ type: 'scan', sourcePath, files, complete: opts.complete, force: opts.force ?? false })
  }

  remove(paths: string[]): void {
    if (paths.length) this.post({ type: 'remove', paths })
  }

  removeUnder(dir: string): void {
    this.post({ type: 'removeUnder', dir })
  }

  async stop(): Promise<void> {
    const w = this.worker
    this.worker = null
    if (w) await w.terminate()
  }
}

export type { FileStatus }
