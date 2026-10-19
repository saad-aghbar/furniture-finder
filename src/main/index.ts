import { app } from 'electron'
import { FurnitureFinderApp } from './app'
import { log } from './log'

// e2e tests (and power users) can point the app at a separate data folder.
if (process.env['FF_USER_DATA']) app.setPath('userData', process.env['FF_USER_DATA'])

app.setAppUserModelId('com.furniturefinder.app')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const ff = new FurnitureFinderApp()
  // Exposed for Playwright e2e tests only (evaluated in the main process).
  if (process.env['FF_E2E']) (globalThis as unknown as { __ff: FurnitureFinderApp }).__ff = ff

  app.on('second-instance', () => ff.showBar(true))

  // The app lives in the bar + tray: closing the onboarding/settings windows must not quit.
  app.on('window-all-closed', () => {
    /* keep running */
  })

  let shuttingDown = false
  app.on('before-quit', (e) => {
    if (shuttingDown) return
    e.preventDefault()
    shuttingDown = true
    // quit() again (not exit()) so the "quit" event fires – electron-updater installs on it.
    void ff.shutdown().finally(() => app.quit())
  })

  if (process.platform === 'darwin') app.dock?.hide()

  process.on('uncaughtException', (err) => log.error('uncaught', err))
  process.on('unhandledRejection', (err) => log.error('unhandled rejection', err))

  app
    .whenReady()
    .then(() => ff.start())
    .catch((err) => {
      log.error('start-up failed', err)
      app.exit(1)
    })
}
