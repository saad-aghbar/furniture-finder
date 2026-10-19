import type { BrowserWindow, Display } from 'electron'
import type { OverlayState, SnapTarget } from '../../shared/ipc'
import type { SnapPosition } from '../../shared/types'
import { createWindow, send } from './common'

/**
 * Full-work-area, click-through, transparent window that draws the "ghost pill" snap targets
 * while the bar is being moved. Sits just under the bar in the z-order.
 */
export class SnapOverlay {
  private win: BrowserWindow | null = null
  private displayId: number | null = null
  private ready = false
  private pending: OverlayState | null = null

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const win = createWindow('overlay', {
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      ...(process.platform === 'win32' ? { type: 'toolbar' } : process.platform === 'darwin' ? { type: 'panel' } : {})
    })
    win.setIgnoreMouseEvents(true)
    win.setAlwaysOnTop(true, 'pop-up-menu')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.ready = false
    win.webContents.once('did-finish-load', () => {
      this.ready = true
      if (this.pending) send(win, 'overlay:state', this.pending)
    })
    this.win = win
    return win
  }

  /** Show the targets of `display`; target coordinates are in screen space. */
  show(display: Display, targets: SnapTarget[], active: SnapPosition | null, raiseAbove: BrowserWindow): void {
    const win = this.ensure()
    const wa = display.workArea
    if (this.displayId !== display.id) {
      win.setBounds(wa)
      this.displayId = display.id
    }
    const state: OverlayState = {
      targets: targets.map((t) => ({ ...t, x: t.x - wa.x, y: t.y - wa.y })),
      active
    }
    this.pending = state
    if (this.ready) send(win, 'overlay:state', state)
    if (!win.isVisible()) {
      win.showInactive()
      raiseAbove.moveTop()
    }
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      send(this.win, 'overlay:state', { targets: [], active: null } satisfies OverlayState)
      const w = this.win
      setTimeout(() => {
        if (!w.isDestroyed()) w.hide()
      }, 220)
    }
    this.displayId = null
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }
}
