import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateCheckResult } from '../shared/ipc'
import { log } from './log'

const { autoUpdater } = electronUpdater
const SIX_HOURS = 6 * 60 * 60 * 1000

/**
 * Quiet auto-update from GitHub Releases (the only network access of the app).
 * Disabled in development and in e2e tests.
 */
export class Updater {
  private downloaded: string | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly onReady: (version: string) => void) {}

  get enabled(): boolean {
    return app.isPackaged && !process.env['FF_E2E'] && !process.env['FF_DISABLE_UPDATES']
  }

  start(): void {
    if (!this.enabled) return
    autoUpdater.logger = log
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('update-downloaded', (info) => {
      this.downloaded = info.version
      log.info('update downloaded', info.version)
      this.onReady(info.version)
    })
    autoUpdater.on('error', (err) => log.warn('update error', err?.message))
    setTimeout(() => void this.check(), 10_000)
    this.timer = setInterval(() => void this.check(), SIX_HOURS)
  }

  async check(): Promise<UpdateCheckResult> {
    if (!this.enabled) return 'disabled'
    if (this.downloaded) return 'downloaded'
    try {
      const res = await autoUpdater.checkForUpdates()
      return res?.isUpdateAvailable ? 'available' : 'none'
    } catch (err) {
      log.warn('update check failed', (err as Error).message)
      return 'error'
    }
  }

  install(): void {
    if (this.downloaded) autoUpdater.quitAndInstall(true, true)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }
}
