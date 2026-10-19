import { normalize } from '@shared/normalize'
import type { ResultCell } from '@shared/types'

const PRICE_WORDS = ['מחיר', 'עלות', 'price', 'cost', 'سعر', 'السعر', 'ثمن', 'التكلفة'].map((w) => normalize(w))
const CURRENCY = /[₪$€£]|ש"ח|ש״ח|ش\.?ج/

/** Is this cell a price? (column title says so, or the value carries a currency sign) */
export function isPrice(cell: ResultCell): boolean {
  if (CURRENCY.test(cell.value)) return true
  const h = normalize(cell.header)
  return h.length > 0 && PRICE_WORDS.some((w) => h.includes(w)) && /\d/.test(cell.value)
}

/** Writing direction of a piece of data: right-to-left when its first letter is Hebrew or Arabic. */
export function dataDir(text: string): 'rtl' | 'ltr' {
  const m = text.match(/[\p{L}]/u)
  return m && /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(m[0]) ? 'rtl' : 'ltr'
}
