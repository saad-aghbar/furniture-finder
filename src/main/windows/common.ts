import { BrowserWindow, shell, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'node:path'

export type View = 'bar' | 'onboarding' | 'settings' | 'overlay'

const ALLOWED_EXTERNAL = /^https:\/\/github\.com\//

/** Secure defaults shared by every window. */
export function createWindow(view: View, opts: BrowserWindowConstructorOptions, query: Record<string, string> = {}): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    backgroundColor: '#00000000',
    ...opts,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: view !== 'bar',
      ...opts.webPreferences
    }
  })
  // No navigation away from the app, no new windows; GitHub links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (ALLOWED_EXTERNAL.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  const search = new URLSearchParams({ view, ...query }).toString()
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}?${search}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { search })
  return win
}

export function send<T>(win: BrowserWindow | null | undefined, channel: string, payload?: T): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}
