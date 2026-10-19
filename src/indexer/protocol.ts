import type { FileStatus } from '../shared/types'
import type { FileStat, SourceRecord } from './indexer'

/** Messages main → indexing worker. */
export type ToWorker =
  | { type: 'sources'; sources: SourceRecord[] }
  | { type: 'scan'; sourcePath: string; files: FileStat[]; complete: boolean; force: boolean }
  | { type: 'remove'; paths: string[] }
  | { type: 'removeUnder'; dir: string }
  | { type: 'shutdown' }

/** Messages indexing worker → main. */
export type FromWorker =
  | { type: 'ready'; rebuilt: boolean }
  | { type: 'progress'; filesTotal: number; filesDone: number; rowsIndexed: number; currentFile: string | null }
  | { type: 'fileDone'; outcome: FileStatus; skipped: boolean }
  | { type: 'changed' }
  | { type: 'idle' }
  | { type: 'fatal'; message: string }
