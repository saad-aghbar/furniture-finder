import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, CheckCircle2, FolderOpen, Info, Keyboard, Palette, RefreshCw, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { hotkeyLabel, type MessageKey } from '@shared/i18n'
import type { AppInfo, UpdateCheckResult } from '@shared/ipc'
import { DEFAULT_SETTINGS, type FileErrorKey, type FileStatus, type Lang, type MotionPref, type TextSize, type ThemePref } from '@shared/types'
import iconUrl from '../../../resources/icon.png'
import { useApp, useFFEvent } from '../shared/AppProvider'
import { WindowChrome } from '../shared/WindowChrome'
import { dur, fade, spring } from '../motion/tokens'
import w from '../shared/window.module.css'
import s from './settings.module.css'

type Tab = 'general' | 'search' | 'appearance' | 'files' | 'about'
const TABS: { id: Tab; icon: ReactNode }[] = [
  { id: 'general', icon: <SlidersHorizontal size={20} strokeWidth={1.75} /> },
  { id: 'search', icon: <Search size={20} strokeWidth={1.75} /> },
  { id: 'appearance', icon: <Palette size={20} strokeWidth={1.75} /> },
  { id: 'files', icon: <FolderOpen size={20} strokeWidth={1.75} /> },
  { id: 'about', icon: <Info size={20} strokeWidth={1.75} /> }
]

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }): ReactNode {
  const { dir, reduceMotion } = useApp()
  const travel = dir === 'rtl' ? -24 : 24
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={s.switch} onClick={() => onChange(!checked)}>
      <motion.span className={s.knob} animate={{ x: checked ? travel : 0 }} transition={reduceMotion ? { duration: 0 } : spring.snappy} />
    </button>
  )
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; lang?: string }[]; onChange: (v: T) => void; label: string }): ReactNode {
  const id = useId()
  const { reduceMotion } = useApp()
  return (
    <div className={s.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} className={s.segment} onClick={() => onChange(o.id)} lang={o.lang}>
          {o.id === value && <motion.span layoutId={`seg-${id}`} className={s.segmentPill} transition={reduceMotion ? { duration: 0 } : spring.snappy} />}
          <span className={s.segmentLabel}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

function Row({ label, hint, children, stack }: { label: string; hint?: string; children: ReactNode; stack?: boolean }): ReactNode {
  return (
    <div className={`${s.row} ${stack ? s.rowStack : ''}`}>
      <div className={s.label}>
        {label}
        {hint && <span className={s.hint}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const CODE_KEYS: Record<string, string> = { Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/' }

/** Build an Electron accelerator from a key press (layout-independent: uses e.code). */
function accelerator(e: KeyboardEvent): string | null {
  let key: string | null
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5)
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code
  else key = CODE_KEYS[e.code] ?? null
  if (!key) return null
  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  const fkey = /^F\d/.test(key)
  if (!fkey && !mods.some((m) => m === 'CommandOrControl' || m === 'Alt')) return null
  return [...mods, key].join('+')
}

function HotkeyField(): ReactNode {
  const { settings, update, t } = useApp()
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState(false)
  const onKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (!recording) return
    e.preventDefault()
    if (e.key === 'Escape') {
      setRecording(false)
      return
    }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
    const acc = accelerator(e)
    if (!acc) {
      setError(true)
      return
    }
    setError(false)
    setRecording(false)
    void update({ hotkey: acc })
  }
  return (
    <div className={s.inlineButtons}>
      <button type="button" className={`${s.kbd} ${recording ? s.kbdRecording : ''}`} onClick={() => setRecording(true)} onKeyDown={onKey} onBlur={() => setRecording(false)} aria-live="polite">
        {recording ? t('settings.hotkeyRecord') : hotkeyLabel(settings.hotkey, window.ff.platform)}
      </button>
      {!recording && (
        <button type="button" className={`${w.ghost} ${s.small}`} onClick={() => setRecording(true)}>
          <Keyboard size={18} strokeWidth={1.75} aria-hidden />
          {t('settings.hotkeyChange')}
        </button>
      )}
      {settings.hotkey !== DEFAULT_SETTINGS.hotkey && !recording && (
        <button type="button" className={`${w.ghost} ${s.small}`} onClick={() => void update({ hotkey: DEFAULT_SETTINGS.hotkey })}>
          {t('settings.hotkeyReset')}
        </button>
      )}
      {error && recording && <span className={s.status}>{t('settings.hotkeyInvalid')}</span>}
    </div>
  )
}

export default function SettingsApp(): ReactNode {
  const { t, reduceMotion, dir } = useApp()
  const [tab, setTab] = useState<Tab>('general')

  const onTabKey = (e: KeyboardEvent): void => {
    const i = TABS.findIndex((x) => x.id === tab)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = TABS[(i + (e.key === 'ArrowDown' ? 1 : TABS.length - 1)) % TABS.length]!
      setTab(next.id)
      document.getElementById(`tab-${next.id}`)?.focus()
    }
  }

  return (
    <WindowChrome title={t('settings.title')}>
      <div className={s.layout}>
        <nav className={s.nav} role="tablist" aria-orientation="vertical" onKeyDown={onTabKey}>
          <h1 className={s.navTitle}>{t('settings.title')}</h1>
          {TABS.map((x) => (
            <button key={x.id} id={`tab-${x.id}`} type="button" role="tab" aria-selected={tab === x.id} aria-controls="settings-panel" tabIndex={tab === x.id ? 0 : -1} className={s.tab} onClick={() => setTab(x.id)}>
              {tab === x.id && <motion.span layoutId="tab-indicator" className={s.tabIndicator} transition={reduceMotion ? { duration: 0 } : spring.snappy} />}
              {x.icon}
              <span className={s.tabLabel}>{t(`settings.tab.${x.id}` as MessageKey)}</span>
            </button>
          ))}
        </nav>
        <div className={s.panel} id="settings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: dur.xs } }}
              transition={reduceMotion ? fade : spring.smooth}
              dir={dir}
            >
              {tab === 'general' && <GeneralTab />}
              {tab === 'search' && <SearchTab />}
              {tab === 'appearance' && <AppearanceTab />}
              {tab === 'files' && <FilesTab />}
              {tab === 'about' && <AboutTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </WindowChrome>
  )
}

function GeneralTab(): ReactNode {
  const { settings, update, t } = useApp()
  return (
    <section className={s.section}>
      <h2 className={s.sectionTitle}>{t('settings.tab.general')}</h2>
      <Row label={t('settings.language')}>
        <Segmented<Lang>
          label={t('settings.language')}
          value={settings.language}
          onChange={(language) => void update({ language })}
          options={[
            { id: 'ar', label: 'العربية', lang: 'ar' },
            { id: 'he', label: 'עברית', lang: 'he' },
            { id: 'en', label: 'English', lang: 'en' }
          ]}
        />
      </Row>
      <Row label={t('settings.startWithWindows')} hint={t('settings.startWithWindowsHint')}>
        <Toggle label={t('settings.startWithWindows')} checked={settings.startWithWindows} onChange={(v) => void update({ startWithWindows: v })} />
      </Row>
      <Row label={t('settings.hotkey')} stack>
        <HotkeyField />
      </Row>
      <Row label={t('settings.showTray')}>
        <Toggle label={t('settings.showTray')} checked={settings.showTray} onChange={(v) => void update({ showTray: v })} />
      </Row>
    </section>
  )
}

function SearchTab(): ReactNode {
  const { settings, update, t } = useApp()
  return (
    <section className={s.section}>
      <h2 className={s.sectionTitle}>{t('settings.tab.search')}</h2>
      <Row label={t('settings.resultsPerPage')}>
        <select className={s.select} value={settings.resultsPerPage} onChange={(e) => void update({ resultsPerPage: Number(e.target.value) })} aria-label={t('settings.resultsPerPage')}>
          {[25, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Row>
      <Row label={t('settings.fuzzy')}>
        <Toggle label={t('settings.fuzzy')} checked={settings.fuzzy} onChange={(v) => void update({ fuzzy: v })} />
      </Row>
      <Row label={t('settings.copyHeaders')}>
        <Toggle label={t('settings.copyHeaders')} checked={settings.copyHeaders} onChange={(v) => void update({ copyHeaders: v })} />
      </Row>
      <Row label={t('settings.recent')}>
        <div className={s.inlineButtons}>
          {settings.recentSearches.length > 0 && (
            <button type="button" className={`${w.ghost} ${s.small}`} onClick={() => void window.ff.invoke('recent:clear')}>
              {t('settings.clearRecent')}
            </button>
          )}
          <Toggle label={t('settings.recent')} checked={settings.recentSearchesOn} onChange={(v) => void update({ recentSearchesOn: v })} />
        </div>
      </Row>
    </section>
  )
}

function AppearanceTab(): ReactNode {
  const { settings, update, t } = useApp()
  return (
    <section className={s.section}>
      <h2 className={s.sectionTitle}>{t('settings.tab.appearance')}</h2>
      <Row label={t('settings.theme')} stack>
        <Segmented<ThemePref>
          label={t('settings.theme')}
          value={settings.theme}
          onChange={(theme) => void update({ theme })}
          options={(['light', 'dark', 'system'] as const).map((id) => ({ id, label: t(`settings.theme.${id}`) }))}
        />
      </Row>
      <Row label={t('settings.textSize')} stack>
        <Segmented<TextSize>
          label={t('settings.textSize')}
          value={settings.textSize}
          onChange={(textSize) => void update({ textSize })}
          options={(['normal', 'large', 'xlarge'] as const).map((id) => ({ id, label: t(`settings.textSize.${id}`) }))}
        />
      </Row>
      <Row label={t('settings.idleOpacity')}>
        <div className={s.inlineButtons}>
          <input type="range" className={s.range} min={60} max={100} step={5} value={settings.idleOpacity} onChange={(e) => void update({ idleOpacity: Number(e.target.value) })} aria-label={t('settings.idleOpacity')} />
          <span className={`${s.rangeValue} num`}>{settings.idleOpacity}%</span>
        </div>
      </Row>
      <Row label={t('settings.reduceMotion')} stack>
        <Segmented<MotionPref>
          label={t('settings.reduceMotion')}
          value={settings.reduceMotion}
          onChange={(reduceMotion) => void update({ reduceMotion })}
          options={(['system', 'on', 'off'] as const).map((id) => ({ id, label: t(`settings.motion.${id}`) }))}
        />
      </Row>
    </section>
  )
}

function FilesTab(): ReactNode {
  const { settings, update, t } = useApp()
  const [errors, setErrors] = useState<FileStatus[]>([])
  const load = useCallback(() => void window.ff.invoke('index:errors').then(setErrors), [])
  useEffect(load, [load])
  useFFEvent('index:changed', load)
  return (
    <section className={s.section}>
      <h2 className={s.sectionTitle}>{t('settings.tab.files')}</h2>
      <Row label={t('settings.manageFiles')}>
        <button type="button" className={`${w.secondary} ${s.small}`} onClick={() => void window.ff.invoke('app:open-window', 'sources')}>
          <FolderOpen size={18} strokeWidth={1.75} aria-hidden />
          {t('bar.manageFiles')}
        </button>
      </Row>
      <Row label={t('settings.autoWatch')}>
        <Toggle label={t('settings.autoWatch')} checked={settings.autoWatch} onChange={(v) => void update({ autoWatch: v })} />
      </Row>
      <Row label={t('settings.reindex')}>
        <button type="button" className={`${w.secondary} ${s.small}`} onClick={() => void window.ff.invoke('index:reindex', { force: true })}>
          <RefreshCw size={18} strokeWidth={1.75} aria-hidden />
          {t('settings.reindex')}
        </button>
      </Row>
      <Row label={t('settings.filesErrors')} stack>
        {errors.length === 0 ? (
          <div className={s.ok}>
            <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden />
            {t('settings.noErrors')}
          </div>
        ) : (
          <ul className={w.errorList}>
            {errors.map((e) => (
              <li key={e.path} className={w.errorItem} title={e.path}>
                <AlertTriangle size={20} strokeWidth={1.75} aria-hidden />
                <div>
                  <div className={w.errorName}>
                    <bdi dir="ltr">{e.name}</bdi>
                  </div>
                  <div className={w.errorText}>{t(`errors.${(e.error ?? 'corrupt') as FileErrorKey}` as MessageKey)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Row>
    </section>
  )
}

function AboutTab(): ReactNode {
  const { t } = useApp()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [check, setCheck] = useState<UpdateCheckResult | 'checking' | null>(null)
  useEffect(() => {
    void window.ff.invoke('app:info').then(setInfo)
  }, [])
  const run = async (): Promise<void> => {
    setCheck('checking')
    setCheck(await window.ff.invoke('app:check-updates'))
  }
  return (
    <section className={s.section}>
      <div className={s.about}>
        <img src={iconUrl} alt="" />
        <div>
          <h2 className={w.h2}>{t('app.name')}</h2>
          {info && <div className={`${w.muted} num`}>{t('settings.version', { version: info.version })}</div>}
        </div>
      </div>
      <Row label={t('settings.checkUpdates')} stack>
        <div className={s.inlineButtons}>
          <button type="button" className={`${w.secondary} ${s.small}`} onClick={() => void run()} disabled={check === 'checking'}>
            <RefreshCw size={18} strokeWidth={1.75} aria-hidden className={check === 'checking' ? 'spin' : undefined} />
            {check === 'checking' ? t('settings.checking') : t('settings.checkUpdates')}
          </button>
          {check && check !== 'checking' && (
            <span className={s.status} role="status">
              {t(`settings.update.${check}` as MessageKey)}
            </span>
          )}
        </div>
      </Row>
      <Row label={t('settings.github')}>
        <button type="button" className={`${w.ghost} ${s.small}`} onClick={() => void window.ff.invoke('app:open-repo')}>
          github.com/…/furniture-finder
        </button>
      </Row>
      <Row label={t('settings.logs')}>
        <button type="button" className={`${w.ghost} ${s.small}`} onClick={() => void window.ff.invoke('app:open-logs')}>
          <FolderOpen size={18} strokeWidth={1.75} aria-hidden />
          {t('settings.logs')}
        </button>
      </Row>
      <div className={s.privacy}>
        <ShieldCheck size={22} strokeWidth={1.75} aria-hidden />
        <span>{t('settings.privacy')}</span>
      </div>
    </section>
  )
}
