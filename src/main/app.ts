import { app, BrowserWindow, clipboard, ClipboardItem, dialog, globalShortcut, ipcMain, nativeTheme, shell } from 'electron'
import { dirname, join } from 'node:path'
import { openReadDb, type DB } from '../indexer/db'
import { detectLang, translate } from '../shared/i18n'
import type { InvokeChannel, InvokeMap } from '../shared/ipc'
import { EXCEL_EXTENSIONS, type Settings } from '../shared/types'
import { formatRow } from './clipboard-format'
import { openInExcel } from './excel'
import { IndexerHost } from './indexer-host'
import { schemas } from './ipc/schemas'
import { log } from './log'
import { SearchService } from './search/service'
import { settings } from './settings'
import { SourceManager } from './sources/manager'
import { isIndexable } from './sources/scan'
import { AppTray } from './tray'
import { Updater } from './updater'
import { BarWindow } from './windows/bar'
import { send } from './windows/common'
import { DialogWindow } from './windows/dialogs'

export const REPO_URL = 'https://github.com/saad-aghbar/furniture-finder'
const MAX_RECENT_SEARCHES = 8
const MAX_RECENT_COPIES = 50
/** An update installs by itself after this long without anyone using the app. */
const IDLE_BEFORE_UPDATE_MS = 10 * 60 * 1000

type Handler<C extends InvokeChannel> = (
  payload: InvokeMap[C]['req'],
  sender: Electron.WebContents
) => InvokeMap[C]['res'] | Promise<InvokeMap[C]['res']>

/** Wires windows, indexing, search, tray, hotkey and updates together. */
export class FurnitureFinderApp {
  readonly bar = new BarWindow()
  readonly onboarding = new DialogWindow('onboarding', { width: 760, height: 560 })
  readonly settingsWin = new DialogWindow('settings', { width: 780, height: 600 })
  host!: IndexerHost
  sources!: SourceManager
  search: SearchService | null = null
  private readDb: DB | null = null
  private tray!: AppTray
  private updater!: Updater
  private hotkey: string | null = null
  private quitting = false
  private lastActivity = Date.now()

  private isIdle(): boolean {
    if (Date.now() - this.lastActivity < IDLE_BEFORE_UPDATE_MS) return false
    if (this.bar.win?.isFocused()) return false
    return !this.onboarding.win && !this.settingsWin.win
  }

  async start(): Promise<void> {
    settings.init()
    if (!settings.get('firstRunDone') && settings.get('sources').length === 0) {
      settings.set({ language: detectLang(app.getPreferredSystemLanguages()) })
    }
    this.applyTheme(settings.all())

    const dbPath = join(app.getPath('userData'), 'index.db')
    this.host = new IndexerHost(dbPath)
    const { rebuilt } = await this.host.start()
    this.readDb = openReadDb(dbPath)
    this.sources = new SourceManager(this.host)
    this.search = new SearchService(this.readDb, () => this.sources.offlineSet())
    this.wireIndexEvents()
    this.registerIpc()

    settings.on('changed', (now: Settings, before: Settings) => this.onSettingsChanged(now, before))

    this.tray = new AppTray({
      toggleBar: () => this.bar.toggle(),
      showBar: () => this.showBar(true),
      isBarHidden: () => this.bar.isHidden(),
      manageFiles: () => this.openSources('manage'),
      openSettings: () => this.openSettings(),
      quit: () => this.quit()
    })
    this.tray.sync()
    this.updater = new Updater(
      (version) => send(this.bar.win, 'update:ready', { version }),
      () => this.isIdle()
    )
    this.updater.start()
    this.registerHotkey(settings.get('hotkey'))
    this.applyLoginItem(settings.get('startWithWindows'))

    if (settings.get('firstRunDone')) {
      this.bar.create()
      // Quick background change check of every source (also re-indexes after a schema rebuild).
      void this.sources.start().then(() => rebuilt && log.info('index rebuilt for new version'))
    } else {
      this.openSources('first-run')
      void this.sources.start()
    }
    log.info('started', app.getVersion(), process.platform)
  }

  private wireIndexEvents(): void {
    this.host.on('progress', (p) => this.broadcast('index:progress', p))
    this.host.on('changed', () => {
      this.search?.invalidate()
      this.broadcast('index:changed', undefined)
    })
    this.host.on('restarted', () => {
      this.sources.list()
      void this.sources.rescanAll(false)
    })
    // settings.sources is owned by SourceManager; tell every window about count/status changes
    setImmediate(() => this.sources.on('changed', (list) => this.broadcast('sources:changed', list)))
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const w of BrowserWindow.getAllWindows()) send(w, channel, payload)
  }

  showBar(focus: boolean): void {
    if (!this.bar.win) this.bar.create()
    else this.bar.show(focus)
  }

  openSources(mode: 'first-run' | 'manage'): void {
    this.onboarding.open({ mode }, (win) => send(win, 'onboarding:mode', mode))
  }

  openSettings(): void {
    this.settingsWin.open()
  }

  // ---------- settings side effects ----------

  private applyTheme(s: Settings): void {
    nativeTheme.themeSource = s.theme
  }

  private applyLoginItem(on: boolean): void {
    if (!app.isPackaged || process.env['FF_E2E']) return
    try {
      app.setLoginItemSettings({ openAtLogin: on, args: ['--autostart'] })
    } catch (err) {
      log.warn('could not set login item', err)
    }
  }

  /** Register the new shortcut first; keep the old one if the new one is taken or invalid. */
  private registerHotkey(accel: string): boolean {
    if (accel === this.hotkey) return true
    let ok = false
    try {
      ok = globalShortcut.register(accel, () => this.showBar(true))
    } catch (err) {
      log.warn('invalid hotkey', accel, err)
    }
    if (!ok) {
      log.warn('hotkey could not be registered', accel)
      if (this.hotkey) setImmediate(() => settings.set({ hotkey: this.hotkey! }))
      return false
    }
    if (this.hotkey) globalShortcut.unregister(this.hotkey)
    this.hotkey = accel
    return true
  }

  private onSettingsChanged(now: Settings, before: Settings): void {
    this.broadcast('settings:changed', now)
    if (now.theme !== before.theme) this.applyTheme(now)
    if (now.hotkey !== before.hotkey) this.registerHotkey(now.hotkey)
    if (now.startWithWindows !== before.startWithWindows) this.applyLoginItem(now.startWithWindows)
    if (now.showTray !== before.showTray || now.language !== before.language) this.tray.sync()
    if (now.textSize !== before.textSize) this.bar.applyLayout()
    if (now.autoWatch !== before.autoWatch) this.sources.updateWatchers()
    if (JSON.stringify(now.scope) !== JSON.stringify(before.scope)) this.search?.invalidate()
  }

  // ---------- IPC ----------

  private handle<C extends InvokeChannel>(channel: C, fn: Handler<C>): void {
    ipcMain.handle(channel, async (event, raw: unknown) => {
      if (channel !== 'bar:hover' && channel !== 'bar:layout') this.lastActivity = Date.now()
      const parsed = schemas[channel].safeParse(raw)
      if (!parsed.success) {
        log.warn('rejected IPC payload', channel, parsed.error.message)
        throw new Error('invalid request')
      }
      return fn(parsed.data as InvokeMap[C]['req'], event.sender)
    })
  }

  private registerIpc(): void {
    const h = this.handle.bind(this)
    h('settings:get', () => settings.all())
    h('settings:set', (patch) => settings.set(patch))

    h('sources:list', () => this.sources.list())
    h('sources:add', (paths) => this.sources.add(paths))
    h('sources:remove', (path) => this.sources.remove(path))
    h('sources:pick', async (kind, sender) => {
      const lang = settings.get('language')
      const parent = BrowserWindow.fromWebContents(sender) ?? undefined
      const opts: Electron.OpenDialogOptions =
        kind === 'folder'
          ? { title: translate(lang, 'dialog.addFolder'), properties: ['openDirectory', 'multiSelections'] }
          : {
              title: translate(lang, 'dialog.addFiles'),
              properties: ['openFile', 'multiSelections'],
              filters: [{ name: translate(lang, 'dialog.excelFilter'), extensions: EXCEL_EXTENSIONS.map((e) => e.slice(1)) }]
            }
      const res = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts)
      return res.canceled ? [] : res.filePaths
    })

    h('index:reindex', async ({ force }) => {
      await this.sources.rescanAll(force)
    })
    h('index:progress', () => this.host.progress())
    h('index:errors', () => this.search?.errors() ?? [])

    h('search', (req) => {
      if (!this.search) return { seq: req.seq, query: req.query, results: [], total: 0, capped: false, tookMs: 0, fuzzyUsed: false }
      return this.search.search(req)
    })
    h('scope:tree', () => this.search?.scopeTree() ?? [])
    h('recent:add', (q) => {
      if (!settings.get('recentSearchesOn')) return
      const list = [q, ...settings.get('recentSearches').filter((x) => x !== q)].slice(0, MAX_RECENT_SEARCHES)
      settings.set({ recentSearches: list })
    })
    h('recent:clear', () => {
      settings.set({ recentSearches: [] })
    })

    h('copy:row', async ({ cells, withHeaders, key }) => {
      const { text, html } = formatRow(cells, withHeaders)
      // Excel takes the HTML table (cells), WhatsApp/Notepad take the plain text lines.
      await clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html })])
      if (key) {
        const list = [key, ...settings.get('recentlyCopied').filter((k) => k !== key)].slice(0, MAX_RECENT_COPIES)
        settings.set({ recentlyCopied: list })
      }
    })
    h('copy:text', (text) => clipboard.writeText(text))
    h('excel:open', ({ filePath, sheet, row }) => {
      // Only ever open files that are in the index – never arbitrary paths from the renderer.
      const known = this.readDb?.prepare('SELECT 1 FROM files WHERE path = ?').get(filePath)
      if (!known || !isIndexable(filePath)) return 'failed'
      return openInExcel(filePath, sheet, row)
    })

    h('bar:layout', () => this.bar.getLayout())
    h('bar:hover', (on) => this.bar.setHover(on))
    h('bar:panel', () => undefined)
    h('bar:drag-start', () => this.bar.startDrag())
    h('bar:drag-end', ({ cancel }) => this.bar.endDrag(cancel))
    h('bar:resize-start', (edge) => this.bar.startResize(edge))
    h('bar:resize-end', () => this.bar.endResize())
    h('bar:move-mode', (on) => this.bar.setMoveMode(on))
    h('bar:move-cancel', () => this.bar.cancelMove())
    h('bar:snap', (pos) => this.bar.snapTo(pos))
    h('bar:hide', () => {
      this.bar.hide()
      this.tray.refresh()
    })

    h('app:open-window', (which) => (which === 'settings' ? this.openSettings() : this.openSources('manage')))
    h('app:onboarding-done', () => {
      settings.set({ firstRunDone: true })
      this.showBar(false)
      this.onboarding.close()
    })
    h('app:quit', () => this.quit())
    h('app:info', () => ({
      version: app.getVersion(),
      platform: process.platform,
      isPackaged: app.isPackaged,
      logsPath: dirname(log.transports.file.getFile().path),
      repoUrl: REPO_URL
    }))
    h('app:check-updates', () => this.updater.check())
    h('app:install-update', () => {
      this.quitting = true
      this.updater.install()
    })
    h('app:open-logs', () => {
      void shell.openPath(dirname(log.transports.file.getFile().path))
    })
    h('app:open-repo', () => {
      void shell.openExternal(REPO_URL)
    })
    h('window:close', (_p, sender) => BrowserWindow.fromWebContents(sender)?.close())
    h('window:minimize', (_p, sender) => BrowserWindow.fromWebContents(sender)?.minimize())
  }

  get isQuitting(): boolean {
    return this.quitting
  }

  quit(): void {
    this.quitting = true
    app.quit()
  }

  async shutdown(): Promise<void> {
    globalShortcut.unregisterAll()
    this.updater?.stop()
    this.tray?.destroy()
    await this.sources?.stop()
    await this.host?.stop()
    this.readDb?.close()
    this.bar.destroy()
  }
}
