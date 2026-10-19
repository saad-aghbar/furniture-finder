import en from '../renderer/i18n/en.json'
import he from '../renderer/i18n/he.json'
import ar from '../renderer/i18n/ar.json'
import type { Lang } from './types'

export type MessageKey = keyof typeof en
const MESSAGES: Record<Lang, Record<string, string>> = { en, he, ar }

export const RTL_LANGS: ReadonlySet<Lang> = new Set(['he', 'ar'])
export const isRtl = (lang: Lang): boolean => RTL_LANGS.has(lang)

/** Translate a key, filling `{name}` placeholders. Falls back to English, then to the key. */
export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const msg = MESSAGES[lang][key] ?? MESSAGES.en[key] ?? key
  if (!vars) return msg
  return msg.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? formatVar(lang, vars[name]!) : m))
}

function formatVar(lang: Lang, v: string | number): string {
  if (typeof v !== 'number') return v
  // Western digits in every language: prices and codes in the files use them too.
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : lang, { maximumFractionDigits: 2 }).format(v)
}

/** Pick the UI language from the OS preferred languages. */
export function detectLang(locales: readonly string[]): Lang {
  for (const l of locales) {
    const base = l.toLowerCase().slice(0, 2)
    if (base === 'he' || base === 'iw') return 'he'
    if (base === 'ar') return 'ar'
    if (base === 'en') return 'en'
  }
  return 'en'
}

/** Human-readable hotkey for the current platform ("Ctrl+Shift+Space"). */
export function hotkeyLabel(accelerator: string, platform: string): string {
  return accelerator
    .split('+')
    .map((p) => (p === 'CommandOrControl' || p === 'CmdOrCtrl' ? (platform === 'darwin' ? '⌘' : 'Ctrl') : p))
    .join('+')
}
