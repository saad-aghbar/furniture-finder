import { describe, expect, it } from 'vitest'
import en from '../../src/renderer/i18n/en.json'
import he from '../../src/renderer/i18n/he.json'
import ar from '../../src/renderer/i18n/ar.json'
import { detectLang, hotkeyLabel, translate } from '../../src/shared/i18n'

describe('i18n', () => {
  it('has every English key in Hebrew and Arabic', () => {
    const keys = Object.keys(en).sort()
    expect(Object.keys(he).sort()).toEqual(keys)
    expect(Object.keys(ar).sort()).toEqual(keys)
  })
  it('keeps the same placeholders in every language', () => {
    const ph = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const [k, v] of Object.entries(en)) {
      expect(ph((he as Record<string, string>)[k]!), `he ${k}`).toEqual(ph(v))
      expect(ph((ar as Record<string, string>)[k]!), `ar ${k}`).toEqual(ph(v))
    }
  })
  it('fills placeholders with Western digits', () => {
    expect(translate('ar', 'bar.results', { count: 1234 })).toContain('1,234')
    expect(translate('he', 'bar.results', { count: 5 })).toBe('5 תוצאות')
  })
  it('detects the language from OS locales', () => {
    expect(detectLang(['he-IL', 'en-US'])).toBe('he')
    expect(detectLang(['ar-IL'])).toBe('ar')
    expect(detectLang(['fr-FR'])).toBe('en')
  })
  it('formats hotkeys', () => {
    expect(hotkeyLabel('CommandOrControl+Shift+Space', 'win32')).toBe('Ctrl+Shift+Space')
  })
})
