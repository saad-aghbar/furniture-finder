/**
 * Every IPC channel between the renderer(s) and the main process, with request/response types.
 * Renderers only talk to main through `window.ff` (see src/preload), which accepts these
 * channel names and nothing else. Main validates every request payload with zod (src/main/ipc).
 */
import type {
  FileStatus,
  IndexProgress,
  ScopeTreeSource,
  SearchRequest,
  SearchResponse,
  Settings,
  SnapPosition,
  SourceInfo
} from './types'

export interface CopyCell {
  header: string
  value: string
}

export interface AddSourcesResult {
  added: SourceInfo[]
  /** Paths that were already covered by an existing folder. */
  alreadyCovered: string[]
  /** Paths that do not exist / are not folders or Excel files. */
  rejected: string[]
}

export interface BarLayout {
  openUp: boolean
  barWidth: number
  barHeight: number
  panelMax: number
  margin: number
}

export interface BarState {
  moveMode: boolean
  dragging: boolean
  /** Horizontal drag velocity in px/frame, for the tilt effect. */
  vx: number
}

export interface SnapTarget {
  id: SnapPosition
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayState {
  targets: SnapTarget[]
  active: SnapPosition | null
}

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  isPackaged: boolean
  logsPath: string
  repoUrl: string
}

export type UpdateCheckResult = 'disabled' | 'none' | 'available' | 'downloaded' | 'error'

export interface InvokeMap {
  'settings:get': { req: void; res: Settings }
  'settings:set': { req: Partial<Settings>; res: Settings }
  'sources:list': { req: void; res: SourceInfo[] }
  'sources:add': { req: string[]; res: AddSourcesResult }
  'sources:remove': { req: string; res: SourceInfo[] }
  'sources:pick': { req: 'folder' | 'file'; res: string[] }
  'index:reindex': { req: { force: boolean }; res: void }
  'index:progress': { req: void; res: IndexProgress }
  'index:errors': { req: void; res: FileStatus[] }
  search: { req: SearchRequest; res: SearchResponse }
  'scope:tree': { req: void; res: ScopeTreeSource[] }
  'recent:add': { req: string; res: void }
  'recent:clear': { req: void; res: void }
  'copy:row': { req: { cells: CopyCell[]; withHeaders: boolean; key: string }; res: void }
  'copy:text': { req: string; res: void }
  'excel:open': { req: { filePath: string; sheet: string; row: number }; res: 'selected' | 'opened' | 'failed' }
  'bar:layout': { req: void; res: BarLayout }
  'bar:hover': { req: boolean; res: void }
  'bar:panel': { req: boolean; res: void }
  'bar:drag-start': { req: void; res: void }
  'bar:drag-end': { req: { cancel: boolean }; res: void }
  'bar:resize-start': { req: 'left' | 'right'; res: void }
  'bar:resize-end': { req: void; res: void }
  'bar:move-mode': { req: boolean; res: void }
  'bar:move-cancel': { req: void; res: void }
  'bar:snap': { req: SnapPosition; res: void }
  'bar:hide': { req: void; res: void }
  'app:open-window': { req: 'sources' | 'settings'; res: void }
  'app:onboarding-done': { req: void; res: void }
  'app:quit': { req: void; res: void }
  'app:info': { req: void; res: AppInfo }
  'app:check-updates': { req: void; res: UpdateCheckResult }
  'app:install-update': { req: void; res: void }
  'app:open-logs': { req: void; res: void }
  'app:open-repo': { req: void; res: void }
  'window:close': { req: void; res: void }
  'window:minimize': { req: void; res: void }
}

export interface EventMap {
  'settings:changed': Settings
  'index:progress': IndexProgress
  'index:changed': void
  'sources:changed': SourceInfo[]
  'bar:layout': BarLayout
  'bar:state': BarState
  'bar:focus': void
  'bar:will-hide': void
  'bar:did-show': void
  'update:ready': { version: string }
  'overlay:state': OverlayState
  'onboarding:mode': 'first-run' | 'manage'
}

export type InvokeChannel = keyof InvokeMap
export type EventChannel = keyof EventMap

export const INVOKE_CHANNELS: readonly InvokeChannel[] = [
  'settings:get',
  'settings:set',
  'sources:list',
  'sources:add',
  'sources:remove',
  'sources:pick',
  'index:reindex',
  'index:progress',
  'index:errors',
  'search',
  'scope:tree',
  'recent:add',
  'recent:clear',
  'copy:row',
  'copy:text',
  'excel:open',
  'bar:layout',
  'bar:hover',
  'bar:panel',
  'bar:drag-start',
  'bar:drag-end',
  'bar:resize-start',
  'bar:resize-end',
  'bar:move-mode',
  'bar:move-cancel',
  'bar:snap',
  'bar:hide',
  'app:open-window',
  'app:onboarding-done',
  'app:quit',
  'app:info',
  'app:check-updates',
  'app:install-update',
  'app:open-logs',
  'app:open-repo',
  'window:close',
  'window:minimize'
]

export const EVENT_CHANNELS: readonly EventChannel[] = [
  'settings:changed',
  'index:progress',
  'index:changed',
  'sources:changed',
  'bar:layout',
  'bar:state',
  'bar:focus',
  'bar:will-hide',
  'bar:did-show',
  'update:ready',
  'overlay:state',
  'onboarding:mode'
]

/** The bridge exposed on `window.ff` by the preload script. */
export interface FFBridge {
  invoke<C extends InvokeChannel>(
    channel: C,
    ...args: InvokeMap[C]['req'] extends void ? [] : [InvokeMap[C]['req']]
  ): Promise<InvokeMap[C]['res']>
  on<C extends EventChannel>(channel: C, listener: (payload: EventMap[C]) => void): () => void
  /** Absolute path of a dropped File (drag & drop). */
  pathForFile(file: File): string
  platform: NodeJS.Platform
}
