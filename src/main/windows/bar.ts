import { app, screen, type BrowserWindow, type Display, type Rectangle } from 'electron'
import type { BarLayout, SnapTarget } from '../../shared/ipc'
import type { BarPosition, SnapPosition, TextSize } from '../../shared/types'
import { log } from '../log'
import { settings } from '../settings'
import { createWindow, send } from './common'
import { SnapOverlay } from './overlay'

/** Transparent space around the bar for its CSS shadow. */
const MARGIN = 24
/** Gap between bar and results panel. */
const GAP = 8
const MIN_W = 360
const MAX_W = 1000
const DEFAULT_W = 560
const EDGE = 16
const SNAP_RADIUS = 64
const FRAME_MS = 16
const REASSERT_MS = 2000

const BAR_HEIGHT: Record<TextSize, number> = { normal: 52, large: 56, xlarge: 64 }
const SNAPS: SnapPosition[] = ['top-center', 'top-left', 'top-right', 'bottom-center']

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * The floating search bar. The native window is always "bar + room for the results panel";
 * transparent parts ignore the mouse so clicks reach the apps underneath. This means the window
 * never has to be resized while results animate (no clipping, no flicker).
 */
export class BarWindow {
  win: BrowserWindow | null = null
  private x = 0
  private y = 0
  private width = DEFAULT_W
  private layout: BarLayout = { openUp: false, barWidth: DEFAULT_W, barHeight: 56, panelMax: 400, margin: MARGIN, }
  private userHidden = false
  private hovering = false
  private moveMode = false
  private moveStart: { x: number; y: number } | null = null
  private drag: { offX: number; offY: number; timer: NodeJS.Timeout; lastX: number; snap: SnapPosition | null } | null = null
  private resize: { edge: 'left' | 'right'; startCursor: number; startW: number; startX: number; timer: NodeJS.Timeout } | null = null
  private settle: NodeJS.Timeout | null = null
  private reassert: NodeJS.Timeout | null = null
  private overlay = new SnapOverlay()

  create(): BrowserWindow {
    this.restorePosition()
    const win = createWindow('bar', {
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      hasShadow: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      roundedCorners: false,
      thickFrame: false,
      // 'toolbar' = WS_EX_TOOLWINDOW on Windows: not in Alt-Tab, not in the taskbar.
      ...(process.platform === 'win32' ? { type: 'toolbar' } : process.platform === 'darwin' ? { type: 'panel' } : {}),
      ...this.windowBounds()
    })
    this.win = win
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    win.setIgnoreMouseEvents(true, { forward: true })
    win.once('ready-to-show', () => {
      this.applyLayout()
      win.showInactive() // never steal focus at start-up
      send(win, 'bar:did-show')
    })
    win.on('blur', () => this.keepOnTop())
    win.on('minimize', () => {
      if (!this.userHidden) win.restore()
    })
    win.on('hide', () => {
      if (!this.userHidden) setTimeout(() => this.keepOnTop(), 300)
    })
    win.on('closed', () => {
      this.win = null
      this.stopTimers()
    })
    this.reassert = setInterval(() => this.keepOnTop(), REASSERT_MS)
    screen.on('display-removed', this.onDisplaysChanged)
    screen.on('display-added', this.onDisplaysChanged)
    screen.on('display-metrics-changed', this.onDisplaysChanged)
    return win
  }

  private onDisplaysChanged = (): void => {
    if (!this.isOnAnyDisplay()) this.resetToPrimary()
    this.applyLayout()
  }

  /** Windows can push top-most windows down (Win+D, other top-most apps): put the bar back. */
  private keepOnTop(): void {
    const win = this.win
    if (!win || win.isDestroyed() || this.userHidden) return
    if (!win.isVisible() || win.isMinimized()) {
      if (win.isMinimized()) win.restore()
      win.showInactive()
    }
    win.setAlwaysOnTop(true, 'screen-saver')
    if (process.platform === 'win32' && !win.isFocused()) win.moveTop()
  }

  // ---------- geometry ----------

  private barHeight(): number {
    return BAR_HEIGHT[settings.get('textSize')] ?? 56
  }

  private barRect(): Rectangle {
    return { x: Math.round(this.x), y: Math.round(this.y), width: this.width, height: this.barHeight() }
  }

  private display(): Display {
    return screen.getDisplayMatching(this.barRect())
  }

  private isOnAnyDisplay(): boolean {
    const r = this.barRect()
    return screen.getAllDisplays().some((d) => {
      const wa = d.workArea
      return r.x + r.width > wa.x + 20 && r.x < wa.x + wa.width - 20 && r.y + r.height > wa.y && r.y < wa.y + wa.height - 10
    })
  }

  private restorePosition(): void {
    const saved = settings.get('bar')
    this.width = clamp(saved?.width ?? DEFAULT_W, MIN_W, MAX_W)
    if (saved) {
      this.x = saved.x
      this.y = saved.y
      const stillThere = screen.getAllDisplays().some((d) => d.id === saved.displayId)
      if (stillThere && this.isOnAnyDisplay()) return
      log.info('saved bar monitor is gone – moving bar to primary display')
    }
    this.resetToPrimary()
  }

  private resetToPrimary(): void {
    const t = this.snapTarget('top-center', screen.getPrimaryDisplay())
    this.x = t.x
    this.y = t.y
    this.save()
  }

  private save(): void {
    const pos: BarPosition = { x: Math.round(this.x), y: Math.round(this.y), width: this.width, displayId: this.display().id }
    settings.set({ bar: pos })
  }

  private computeLayout(): BarLayout {
    const wa = this.display().workArea
    const h = this.barHeight()
    const below = wa.y + wa.height - (this.y + h) - GAP - EDGE
    const above = this.y - wa.y - GAP - EDGE
    const openUp = this.y + h / 2 > wa.y + wa.height / 2
    const panelMax = Math.max(160, Math.min(Math.round(wa.height * 0.6), openUp ? above : below))
    return { openUp, barWidth: this.width, barHeight: h, panelMax, margin: MARGIN }
  }

  private windowBounds(layout = this.computeLayout()): Rectangle {
    const height = MARGIN + layout.barHeight + GAP + layout.panelMax + MARGIN
    const y = layout.openUp ? this.y - GAP - layout.panelMax - MARGIN : this.y - MARGIN
    return { x: Math.round(this.x - MARGIN), y: Math.round(y), width: layout.barWidth + MARGIN * 2, height }
  }

  /** Recompute direction / panel size, resize the native window once, tell the renderer. */
  applyLayout(): void {
    const win = this.win
    if (!win || win.isDestroyed()) return
    this.layout = this.computeLayout()
    win.setBounds(this.windowBounds(this.layout))
    send(win, 'bar:layout', this.layout)
  }

  getLayout(): BarLayout {
    return this.layout
  }

  /** Position the window for a bar position while keeping the current layout (during drags). */
  private placeAt(x: number, y: number): void {
    this.x = x
    this.y = y
    const win = this.win
    if (!win || win.isDestroyed()) return
    const b = this.windowBounds(this.layout)
    win.setBounds(b)
  }

  snapTarget(pos: SnapPosition, display = this.display()): SnapTarget {
    const wa = display.workArea
    const w = this.width
    const h = this.barHeight()
    const cx = wa.x + Math.round((wa.width - w) / 2)
    const map: Record<SnapPosition, { x: number; y: number }> = {
      'top-center': { x: cx, y: wa.y + EDGE },
      'top-left': { x: wa.x + EDGE, y: wa.y + EDGE },
      'top-right': { x: wa.x + wa.width - w - EDGE, y: wa.y + EDGE },
      'bottom-center': { x: cx, y: wa.y + wa.height - h - EDGE }
    }
    return { id: pos, ...map[pos], width: w, height: h }
  }

  private targets(display: Display): SnapTarget[] {
    return SNAPS.map((p) => this.snapTarget(p, display))
  }

  // ---------- mouse pass-through ----------

  setHover(hover: boolean): void {
    this.hovering = hover
    this.updateMouse()
  }

  private updateMouse(): void {
    const win = this.win
    if (!win || win.isDestroyed()) return
    const interactive = this.hovering || this.moveMode || this.drag !== null || this.resize !== null
    win.setIgnoreMouseEvents(!interactive, { forward: true })
  }

  // ---------- move / drag ----------

  setMoveMode(on: boolean): void {
    this.moveMode = on
    if (on) {
      this.moveStart = { x: this.x, y: this.y }
      const d = this.display()
      if (this.win) this.overlay.show(d, this.targets(d), null, this.win)
      this.win?.focus()
    } else {
      this.moveStart = null
      if (!this.drag) this.overlay.hide()
    }
    this.sendState(0)
    this.updateMouse()
  }

  cancelMove(): void {
    if (this.moveStart) this.animateTo(this.moveStart.x, this.moveStart.y)
    this.setMoveMode(false)
  }

  startDrag(): void {
    if (this.drag || !this.win) return
    this.stopSettle()
    const c = screen.getCursorScreenPoint()
    const timer = setInterval(() => this.dragTick(), FRAME_MS)
    this.drag = { offX: c.x - this.x, offY: c.y - this.y, timer, lastX: this.x, snap: null }
    this.updateMouse()
  }

  private dragTick(): void {
    const d = this.drag
    if (!d) return
    const c = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(c)
    const wa = display.workArea
    const h = this.barHeight()
    const nx = clamp(c.x - d.offX, wa.x, wa.x + wa.width - this.width)
    const ny = clamp(c.y - d.offY, wa.y, wa.y + wa.height - h)
    const vx = nx - d.lastX
    d.lastX = nx
    this.placeAt(nx, ny)
    const targets = this.targets(display)
    let snap: SnapPosition | null = null
    for (const t of targets) {
      if (Math.hypot(t.x - nx, t.y - ny) < SNAP_RADIUS) snap = t.id
    }
    d.snap = snap
    if (this.win) this.overlay.show(display, targets, snap, this.win)
    this.sendState(vx)
  }

  endDrag(cancel: boolean): void {
    const d = this.drag
    if (!d) return
    clearInterval(d.timer)
    this.drag = null
    if (cancel && this.moveStart) {
      this.animateTo(this.moveStart.x, this.moveStart.y)
    } else if (d.snap) {
      const t = this.snapTarget(d.snap, screen.getDisplayNearestPoint(screen.getCursorScreenPoint()))
      this.animateTo(t.x, t.y)
    } else {
      this.applyLayout()
      this.save()
    }
    if (!this.moveMode) this.overlay.hide()
    this.sendState(0)
    this.updateMouse()
  }

  snapTo(pos: SnapPosition): void {
    const t = this.snapTarget(pos)
    this.animateTo(t.x, t.y)
  }

  /** Spring the bar to a position (magnetic snap); layout is re-applied when it settles. */
  private animateTo(tx: number, ty: number): void {
    this.stopSettle()
    let x = this.x
    let y = this.y
    let vx = 0
    let vy = 0
    const k = 0.16 // stiffness per frame
    const damping = 0.62
    this.settle = setInterval(() => {
      vx = (vx + (tx - x) * k) * damping
      vy = (vy + (ty - y) * k) * damping
      x += vx
      y += vy
      if (Math.abs(tx - x) < 0.5 && Math.abs(ty - y) < 0.5 && Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5) {
        this.stopSettle()
        this.x = tx
        this.y = ty
        this.applyLayout()
        this.save()
        return
      }
      this.placeAt(x, y)
    }, FRAME_MS)
  }

  private stopSettle(): void {
    if (this.settle) clearInterval(this.settle)
    this.settle = null
  }

  private sendState(vx: number): void {
    send(this.win, 'bar:state', { moveMode: this.moveMode, dragging: this.drag !== null, vx })
  }

  // ---------- width resize ----------

  startResize(edge: 'left' | 'right'): void {
    if (this.resize) return
    const c = screen.getCursorScreenPoint()
    const timer = setInterval(() => this.resizeTick(), FRAME_MS)
    this.resize = { edge, startCursor: c.x, startW: this.width, startX: this.x, timer }
    this.updateMouse()
  }

  private resizeTick(): void {
    const r = this.resize
    if (!r) return
    const dx = screen.getCursorScreenPoint().x - r.startCursor
    const w = clamp(r.edge === 'right' ? r.startW + dx : r.startW - dx, MIN_W, MAX_W)
    if (w === this.width) return
    this.width = w
    if (r.edge === 'left') this.x = r.startX + (r.startW - w)
    this.layout = { ...this.layout, barWidth: w }
    this.win?.setBounds(this.windowBounds(this.layout))
    send(this.win, 'bar:layout', this.layout)
  }

  endResize(): void {
    if (!this.resize) return
    clearInterval(this.resize.timer)
    this.resize = null
    this.applyLayout()
    this.save()
    this.updateMouse()
  }

  // ---------- show / hide / focus ----------

  hide(): void {
    this.userHidden = true
    send(this.win, 'bar:will-hide')
    const win = this.win
    setTimeout(() => {
      if (win && !win.isDestroyed() && this.userHidden) win.hide()
    }, 260)
  }

  show(focus: boolean): void {
    const win = this.win
    if (!win || win.isDestroyed()) return
    const wasHidden = this.userHidden || !win.isVisible()
    this.userHidden = false
    if (focus) {
      if (process.platform === 'darwin') app.focus({ steal: true })
      win.show()
      win.focus()
      send(win, 'bar:focus')
    } else {
      win.showInactive()
    }
    if (wasHidden) send(win, 'bar:did-show')
    win.setAlwaysOnTop(true, 'screen-saver')
  }

  toggle(): void {
    if (this.isHidden()) this.show(true)
    else this.hide()
  }

  isHidden(): boolean {
    return this.userHidden || !this.win || !this.win.isVisible()
  }

  private stopTimers(): void {
    if (this.reassert) clearInterval(this.reassert)
    if (this.drag) clearInterval(this.drag.timer)
    if (this.resize) clearInterval(this.resize.timer)
    this.stopSettle()
    screen.removeListener('display-removed', this.onDisplaysChanged)
    screen.removeListener('display-added', this.onDisplaysChanged)
    screen.removeListener('display-metrics-changed', this.onDisplaysChanged)
  }

  destroy(): void {
    this.stopTimers()
    this.overlay.destroy()
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  isDragging(): boolean {
    return this.drag !== null
  }

  /** Current bar rectangle in screen coordinates (used by e2e tests). */
  bounds(): Rectangle {
    return this.barRect()
  }
}
