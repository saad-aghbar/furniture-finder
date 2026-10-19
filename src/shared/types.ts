export type Lang = 'ar' | 'he' | 'en'
export type ThemePref = 'light' | 'dark' | 'system'
export type TextSize = 'normal' | 'large' | 'xlarge'
export type MotionPref = 'system' | 'on' | 'off'

export const EXCEL_EXTENSIONS = ['.xlsx', '.xlsm', '.xlsb', '.xls', '.csv', '.ods'] as const

export interface SourceEntry {
  path: string
  kind: 'folder' | 'file'
  addedAt: number
}

export interface SourceInfo extends SourceEntry {
  status: 'ok' | 'offline' | 'error'
  fileCount: number
  skippedCount: number
}

/** Persisted scope selection. Empty array = all files. Path-based so it survives re-indexing. */
export type ScopeItem =
  | { type: 'source'; path: string }
  | { type: 'file'; path: string }
  | { type: 'sheet'; path: string; sheet: string }

export interface BarPosition {
  x: number
  y: number
  width: number
  displayId: number
}

export interface Settings {
  language: Lang
  firstRunDone: boolean
  startWithWindows: boolean
  hotkey: string
  showTray: boolean
  resultsPerPage: number
  fuzzy: boolean
  copyHeaders: boolean
  recentSearchesOn: boolean
  recentSearches: string[]
  theme: ThemePref
  textSize: TextSize
  idleOpacity: number
  reduceMotion: MotionPref
  autoWatch: boolean
  sources: SourceEntry[]
  scope: ScopeItem[]
  bar: BarPosition | null
  recentlyCopied: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  firstRunDone: false,
  startWithWindows: true,
  hotkey: 'CommandOrControl+Shift+Space',
  showTray: true,
  resultsPerPage: 50,
  fuzzy: true,
  copyHeaders: false,
  recentSearchesOn: false,
  recentSearches: [],
  theme: 'system',
  textSize: 'large',
  idleOpacity: 90,
  reduceMotion: 'system',
  autoWatch: true,
  sources: [],
  scope: [],
  bar: null,
  recentlyCopied: []
}

export interface Highlight {
  start: number
  end: number
}

export interface ResultCell {
  col: number
  header: string
  value: string
  highlights: Highlight[]
}

/** One option row of a product (e.g. "armchair · ₪ 1,100") shown inside the product's card. */
export interface BlockOption {
  rowId: number
  rowNum: number
  cells: ResultCell[]
  /** This option itself matched the search (otherwise shown because it belongs to the product). */
  matched: boolean
}

export interface SearchResult {
  rowId: number
  filePath: string
  fileName: string
  sheetName: string
  rowNum: number
  title: ResultCell
  details: ResultCell[]
  /** All non-empty cells in column order, used for copying the whole row. */
  cells: ResultCell[]
  score: number
  similar: boolean
  offline: boolean
  /** Present when the row is one option of a multi-row product: all options of that product. */
  block?: { start: number; options: BlockOption[] }
}

export interface SearchRequest {
  seq: number
  query: string
  limit?: number
}

export interface SearchResponse {
  seq: number
  query: string
  results: SearchResult[]
  total: number
  /** More matches exist than were ranked (shown as "1000+"). */
  capped: boolean
  tookMs: number
  fuzzyUsed: boolean
}

export type FileErrorKey = 'password' | 'corrupt' | 'unreadable' | 'empty' | 'tooBig'

export interface FileStatus {
  path: string
  name: string
  status: 'ok' | 'error' | 'pending'
  error?: FileErrorKey
  rows: number
  sheets: number
}

export interface IndexProgress {
  running: boolean
  filesTotal: number
  filesDone: number
  rowsIndexed: number
  currentFile: string | null
  errors: FileStatus[]
}

export interface ScopeTreeSheet {
  name: string
  rows: number
}
export interface ScopeTreeFile {
  path: string
  name: string
  /** Path relative to its source folder, for display. */
  relPath: string
  sheets: ScopeTreeSheet[]
  status: string
}
export interface ScopeTreeSource {
  path: string
  name: string
  kind: 'folder' | 'file'
  status: 'ok' | 'offline' | 'error'
  files: ScopeTreeFile[]
}

export type SnapPosition = 'top-center' | 'top-left' | 'top-right' | 'bottom-center'
