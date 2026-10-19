import type { BrowserWindow } from 'electron'
import { createWindow, send } from './common'

const frameless = {
  frame: false,
  transparent: true,
  resizable: false,
  maximizable: false,
  fullscreenable: false,
  hasShadow: process.platform !== 'darwin',
  titleBarStyle: 'hidden' as const
}

/** A normal, centred app window (onboarding / manage files, settings). Reused while open. */
export class DialogWindow {
  win: BrowserWindow | null = null
  constructor(
    private readonly view: 'onboarding' | 'settings',
    private readonly size: { width: number; height: number }
  ) {}

  open(query: Record<string, string> = {}, onLoad?: (win: BrowserWindow) => void): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) {
      if (this.win.isMinimized()) this.win.restore()
      this.win.show()
      this.win.focus()
      onLoad?.(this.win)
      return this.win
    }
    const win = createWindow(this.view, { ...frameless, ...this.size, center: true, skipTaskbar: false, title: 'Furniture Finder' }, query)
    win.once('ready-to-show', () => {
      win.show()
      win.focus()
    })
    win.webContents.once('did-finish-load', () => onLoad?.(win))
    win.on('closed', () => {
      this.win = null
    })
    this.win = win
    return win
  }

  send<T>(channel: string, payload?: T): void {
    send(this.win, channel, payload)
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close()
  }
}
