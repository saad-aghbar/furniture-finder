import { describe, expect, it } from 'vitest'
import {
  codeVariants,
  fuzzyTokens,
  indexText,
  mapRange,
  normalize,
  normalizeWithMap
} from '../../src/shared/normalize'

describe('normalize – English', () => {
  it('lower-cases and collapses whitespace', () => {
    expect(normalize('  Oak   DINING\tTable ')).toBe('oak dining table')
  })
  it('turns punctuation into spaces', () => {
    expect(normalize('Sofa, bed; (grey)!')).toBe('sofa bed grey')
  })
  it('strips Latin accents', () => {
    expect(normalize('Café Chaise-Longue')).toBe('cafe chaise-longue')
  })
  it('applies NFKC (full-width, ligatures)', () => {
    expect(normalize('ＳＯＦＡ ﬁne')).toBe('sofa fine')
  })
  it('drops apostrophes inside words', () => {
    expect(normalize("Dana's chair")).toBe('danas chair')
  })
})

describe('normalize – Arabic', () => {
  it('removes tashkeel and tatweel', () => {
    expect(normalize('كَنَبَة')).toBe(normalize('كنبة'))
    expect(normalize('كـــنبة')).toBe(normalize('كنبة'))
    expect(normalize('هٰذا')).toBe('هذا')
  })
  it('folds alef variants', () => {
    for (const w of ['أريكة', 'إريكة', 'آريكة', 'ٱريكة']) expect(normalize(w)).toBe('اريكه')
  })
  it('folds taa marbuta, alef maqsura, hamza seats', () => {
    expect(normalize('طاولة')).toBe('طاوله')
    expect(normalize('كرسى')).toBe('كرسي')
    expect(normalize('مؤسسة')).toBe('موسسه')
    expect(normalize('رئيسي')).toBe('رييسي')
  })
  it('folds Persian kaf and yeh', () => {
    expect(normalize('کرسی')).toBe('كرسي')
  })
  it('converts Arabic-Indic and Persian digits', () => {
    expect(normalize('ك-١٢٠٣')).toBe('ك-1203')
    expect(normalize('۱۲۳')).toBe('123')
  })
  it('expands presentation forms (lam-alef ligature)', () => {
    expect(normalize('ﻻ')).toBe('لا')
  })
})

describe('normalize – Hebrew', () => {
  it('removes niqqud and cantillation', () => {
    expect(normalize('כּוּרְסָה')).toBe('כורסה')
    expect(normalize('בְּרֵאשִׁ֖ית')).toBe('בראשית')
  })
  it('normalises final letters', () => {
    expect(normalize('ארון')).toBe('ארונ')
    expect(normalize('ך ם ן ף ץ')).toBe('כ מ נ פ צ')
  })
  it('removes geresh / gershayim and quotes inside words', () => {
    expect(normalize('מע"מ')).toBe('מעמ')
    expect(normalize('מע״מ')).toBe('מעמ')
    expect(normalize("בז'")).toBe('בז')
    expect(normalize("ג'ינס")).toBe('גינס')
  })
  it('turns maqaf into a space', () => {
    expect(normalize('תל־אביב')).toBe('תל אביב')
  })
})

describe('normalize – mixed and invisible characters', () => {
  it('handles mixed scripts', () => {
    expect(normalize('Sofa ספה كنبة')).toBe('sofa ספה كنبه')
  })
  it('removes bidi and zero-width characters', () => {
    expect(normalize('‏כורסה‎ ‫sofa‬')).toBe('כורסה sofa')
    expect(normalize('so​fa')).toBe('sofa')
  })
})

describe('codes', () => {
  it('keeps separators inside codes', () => {
    expect(normalize('A-12/3')).toBe('a-12/3')
    expect(normalize('1.5 m')).toBe('1.5 m')
  })
  it('drops separators at the edges', () => {
    expect(normalize('-A12- /x/')).toBe('a12 x')
  })
  it('adds compact variants', () => {
    expect(codeVariants('a-12/3 sofa b.7')).toEqual(['a123', 'b7'])
    expect(indexText(['A-12/3', 'Sofa'])).toBe('a-12/3 sofa a123')
  })
})

describe('numbers', () => {
  it('drops thousands separators so prices match however they are typed', () => {
    expect(normalize('₪ 3,850')).toBe('3850')
    expect(normalize('1,234,567.50')).toBe('1234567.50')
    expect(normalize('٣٬٨٥٠')).toBe('3850')
  })
  it('keeps a comma between words as a separator', () => {
    expect(normalize('sofa,bed 3, 4')).toBe('sofa bed 3 4')
  })
})

describe('offset map', () => {
  it('maps normalised ranges back to the original text', () => {
    const src = 'כּוּרְסָה נוֹחָה'
    const m = normalizeWithMap(src)
    expect(m.text).toBe('כורסה נוחה')
    const i = m.text.indexOf('נוחה')
    const r = mapRange(m, i, i + 4)!
    expect(src.slice(r.start, r.end)).toBe('נוֹחָה')
  })
  it('maps across collapsed whitespace and punctuation', () => {
    const src = '  Oak,   Table '
    const m = normalizeWithMap(src)
    const i = m.text.indexOf('table')
    const r = mapRange(m, i, i + 5)!
    expect(src.slice(r.start, r.end)).toBe('Table')
  })
  it('maps tashkeel words', () => {
    const src = 'كَنَبَة ثلاثية'
    const m = normalizeWithMap(src)
    const r = mapRange(m, 0, 3)!
    expect(src.slice(r.start, r.end)).toBe('كَنَبَ')
  })
  it('has one entry per output unit', () => {
    const m = normalizeWithMap('Ａ-١ ﻻ')
    expect(m.starts.length).toBe(m.text.length)
    expect(m.ends.length).toBe(m.text.length)
  })
})

describe('fuzzy tokens', () => {
  it('keeps distinct words ≥ 4 letters and skips pure numbers', () => {
    expect(fuzzyTokens('sofa bed sofa 12345 כורסה')).toEqual(['sofa', 'כורסה'])
  })
})
