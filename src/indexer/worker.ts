/**
 * Indexing worker (worker_threads). Owns the only write connection to the index database and
 * processes jobs one at a time so the UI and search never block on parsing.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { sep } from 'node:path'
import { openWriteDb } from './db'
import { Indexer, type FileStat } from './indexer'
import type { FromWorker, ToWorker } from './protocol'

const port = parentPort!
const send = (msg: FromWorker): void => port.postMessage(msg)

interface Job {
  sourcePath: string
  file: FileStat
  force: boolean
}

let indexer: Indexer
const queue: Job[] = []
const queued = new Set<string>()
let running = false
let filesTotal = 0
let filesDone = 0
let rowsIndexed = 0
let lastProgress = 0

function progress(current: string | null, force = false): void {
  const now = Date.now()
  if (!force && now - lastProgress < 200) return
  lastProgress = now
  send({ type: 'progress', filesTotal, filesDone, rowsIndexed, currentFile: current })
}

function enqueue(job: Job): void {
  if (queued.has(job.file.path)) {
    const existing = queue.find((j) => j.file.path === job.file.path)
    if (existing) {
      existing.file = job.file
      existing.force ||= job.force
    }
    return
  }
  queued.add(job.file.path)
  queue.push(job)
  filesTotal++
}

async function pump(): Promise<void> {
  if (running) return
  running = true
  try {
    while (queue.length > 0) {
      const job = queue.shift()!
      queued.delete(job.file.path)
      progress(job.file.path, true)
      const rowsBefore = rowsIndexed
      try {
        const out = await indexer.indexFile(job.sourcePath, job.file, {
          force: job.force,
          onRows: (n) => {
            rowsIndexed = rowsBefore + n
            progress(job.file.path)
          }
        })
        rowsIndexed = rowsBefore + out.rows
        filesDone++
        send({ type: 'fileDone', outcome: out, skipped: out.skipped })
        if (!out.skipped) send({ type: 'changed' })
      } catch (err) {
        filesDone++
        send({
          type: 'fileDone',
          outcome: { path: job.file.path, name: job.file.path.split(sep).pop() ?? job.file.path, status: 'error', error: 'unreadable', rows: 0, sheets: 0 },
          skipped: false
        })
        console.error('index failed', job.file.path, err)
      }
      progress(queue[0]?.file.path ?? null, true)
    }
  } finally {
    running = false
    filesTotal = 0
    filesDone = 0
    rowsIndexed = 0
    send({ type: 'progress', filesTotal: 0, filesDone: 0, rowsIndexed: 0, currentFile: null })
    send({ type: 'idle' })
  }
}

function handle(msg: ToWorker): void {
  switch (msg.type) {
    case 'sources':
      indexer.syncSources(msg.sources)
      send({ type: 'changed' })
      break
    case 'scan': {
      if (msg.complete) {
        indexer.reconcileSource(msg.sourcePath, msg.files)
        send({ type: 'changed' })
      }
      for (const file of msg.files) {
        if (msg.force || indexer.needsCheck(file)) enqueue({ sourcePath: msg.sourcePath, file, force: msg.force })
      }
      void pump()
      break
    }
    case 'remove':
      indexer.removeFiles(msg.paths)
      send({ type: 'changed' })
      break
    case 'removeUnder':
      indexer.removeUnder(msg.dir)
      send({ type: 'changed' })
      break
    case 'shutdown':
      process.exit(0)
  }
}

try {
  const { db, rebuilt } = openWriteDb((workerData as { dbPath: string }).dbPath)
  indexer = new Indexer(db)
  port.on('message', (msg: ToWorker) => {
    try {
      handle(msg)
    } catch (err) {
      console.error('worker message failed', err)
    }
  })
  send({ type: 'ready', rebuilt })
} catch (err) {
  send({ type: 'fatal', message: (err as Error).message })
}
