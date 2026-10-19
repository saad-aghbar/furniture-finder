import { Menu, Tray, nativeImage } from 'electron'
import trayIconPath from '../../resources/tray.png?asset'
import trayIconMacPath from '../../resources/trayTemplate.png?asset'
import { translate } from '../shared/i18n'
import { settings } from './settings'

export interface TrayActions {
  toggleBar: () => void
  showBar: () => void
  isBarHidden: () => boolean
  manageFiles: () => void
  openSettings: () => void
  quit: () => void
}

/** Icon near the clock: brings the bar back and gives access to files/settings. */
export class AppTray {
  private tray: Tray | null = null
  constructor(private readonly actions: TrayActions) {}

  sync(): void {
    if (!settings.get('showTray')) {
      this.tray?.destroy()
      this.tray = null
      return
    }
    if (!this.tray) {
      const icon = nativeImage.createFromPath(process.platform === 'darwin' ? trayIconMacPath : trayIconPath)
      if (process.platform === 'darwin') icon.setTemplateImage(true)
      this.tray = new Tray(icon)
      this.tray.on('click', () => this.actions.showBar())
      this.tray.on('right-click', () => this.tray?.popUpContextMenu(this.menu()))
    }
    const lang = settings.get('language')
    this.tray.setToolTip(translate(lang, 'tray.tooltip'))
    if (process.platform !== 'win32') this.tray.setContextMenu(this.menu())
  }

  private menu(): Menu {
    const lang = settings.get('language')
    const t = (k: Parameters<typeof translate>[1]): string => translate(lang, k)
    return Menu.buildFromTemplate([
      { label: this.actions.isBarHidden() ? t('tray.show') : t('tray.hide'), click: () => this.actions.toggleBar() },
      { type: 'separator' },
      { label: t('tray.manage'), click: () => this.actions.manageFiles() },
      { label: t('tray.settings'), click: () => this.actions.openSettings() },
      { type: 'separator' },
      { label: t('tray.quit'), click: () => this.actions.quit() }
    ])
  }

  refresh(): void {
    if (this.tray && process.platform !== 'win32') this.tray.setContextMenu(this.menu())
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
