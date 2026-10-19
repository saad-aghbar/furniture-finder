import { MotionConfig } from 'motion/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isRtl, translate, type MessageKey } from '@shared/i18n'
import { DEFAULT_SETTINGS, type Lang, type Settings } from '@shared/types'

interface AppContextValue {
  settings: Settings
  ready: boolean
  update: (patch: Partial<Settings>) => Promise<Settings>
  lang: Lang
  dir: 'rtl' | 'ltr'
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
  /** True when animations should be replaced by short fades. */
  reduceMotion: boolean
}

const AppContext = createContext<AppContextValue | null>(null)

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = (): void => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

export function AppProvider({ children }: { children: ReactNode }): ReactNode {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)
  const osDark = useMediaQuery('(prefers-color-scheme: dark)')
  const osReduce = useMediaQuery('(prefers-reduced-motion: reduce)')

  useEffect(() => {
    let alive = true
    void window.ff.invoke('settings:get').then((s) => {
      if (!alive) return
      setSettings(s)
      setReady(true)
    })
    const off = window.ff.on('settings:changed', (s) => setSettings(s))
    return () => {
      alive = false
      off()
    }
  }, [])

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch })) // optimistic: the UI reacts instantly
    const next = await window.ff.invoke('settings:set', patch)
    setSettings(next)
    return next
  }, [])

  const lang = settings.language
  const dir = isRtl(lang) ? 'rtl' : 'ltr'
  const reduceMotion = settings.reduceMotion === 'on' ? true : settings.reduceMotion === 'off' ? false : osReduce
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && osDark)

  useEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = dir
    root.dataset['theme'] = dark ? 'dark' : 'light'
    root.dataset['textSize'] = settings.textSize
    root.dataset['reduceMotion'] = String(reduceMotion)
  }, [lang, dir, dark, settings.textSize, reduceMotion])

  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang])

  const value = useMemo(
    () => ({ settings, ready, update, lang, dir, t, reduceMotion }) satisfies AppContextValue,
    [settings, ready, update, lang, dir, t, reduceMotion]
  )
  return (
    <AppContext.Provider value={value}>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>{children}</MotionConfig>
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp outside AppProvider')
  return ctx
}

/** Subscribe to a main-process event for the lifetime of the component. */
export function useFFEvent<C extends Parameters<typeof window.ff.on>[0]>(
  channel: C,
  listener: Parameters<typeof window.ff.on<C>>[1]
): void {
  useEffect(() => window.ff.on(channel, listener), [channel, listener])
}
