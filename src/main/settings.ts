import Store from 'electron-store'
import { EventEmitter } from 'node:events'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'

/** Persistent settings (electron-store JSON in the user-data folder). */
class SettingsStore extends EventEmitter {
  private store: Store<Settings> | null = null

  init(): void {
    this.store = new Store<Settings>({ name: 'settings', defaults: DEFAULT_SETTINGS, clearInvalidConfig: true })
  }

  private get s(): Store<Settings> {
    if (!this.store) throw new Error('settings not initialised')
    return this.store
  }

  all(): Settings {
    return { ...DEFAULT_SETTINGS, ...this.s.store }
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    return (this.s.store[key] ?? DEFAULT_SETTINGS[key]) as Settings[K]
  }

  set(patch: Partial<Settings>): Settings {
    const before = this.all()
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) this.s.set(k as keyof Settings, v as never)
    }
    const after = this.all()
    this.emit('changed', after, before)
    return after
  }
}

export const settings = new SettingsStore()
