import { charLength, normalize } from '../../shared/normalize'

/** One query element; the row matches when ANY alternative matches (alternatives come from typo tolerance). */
export interface TermGroup {
  alternatives: string[]
  /** True for "quoted phrases". */
  phrase: boolean
  /** Original normalised term (before fuzzy expansion). */
  original: string
}

const PHRASE_RE = /(^|\s)["“”„]([^"“”„]+)["“”„](?=\s|$)/g

export function parseQuery(raw: string): TermGroup[] {
  const groups: TermGroup[] = []
  const rest = raw.replace(PHRASE_RE, (_m, lead: string, phrase: string) => {
    const n = normalize(phrase)
    if (n) groups.push({ alternatives: [n], phrase: true, original: n })
    return lead + ' '
  })
  const seen = new Set(groups.map((g) => g.original))
  for (const term of normalize(rest).split(' ')) {
    if (!term || seen.has(term)) continue
    seen.add(term)
    groups.push({ alternatives: [term], phrase: false, original: term })
  }
  // A term contained in another term adds nothing (e.g. "sofa so") – but keep it for highlighting.
  return groups
}

const ftsQuote = (s: string): string => `"${s.replace(/"/g, '""')}"`

/** FTS5 MATCH expression for the groups whose alternatives are all ≥ 3 characters. */
export function buildMatch(groups: TermGroup[]): string | null {
  const parts: string[] = []
  for (const g of groups) {
    if (g.alternatives.some((a) => charLength(a) < 3)) continue
    const alts = g.alternatives.map(ftsQuote)
    parts.push(alts.length === 1 ? alts[0]! : `(${alts.join(' OR ')})`)
  }
  return parts.length ? parts.join(' AND ') : null
}

/** Groups that trigram search cannot handle (< 3 chars) → SQL LIKE filters. */
export function shortGroups(groups: TermGroup[]): TermGroup[] {
  return groups.filter((g) => g.alternatives.some((a) => charLength(a) < 3))
}

export const likeEscape = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`)

// Reused buffers: the fuzzy pass compares one term against tens of thousands of words.
let rowA = new Int32Array(64)
let rowB = new Int32Array(64)
let rowC = new Int32Array(64)

/**
 * Restricted Damerau-Levenshtein (optimal string alignment) with an early cut-off.
 * Works on UTF-16 units – fine for Hebrew, Arabic and Latin (all in the BMP).
 */
export function editDistance(a: string, b: string, max: number): number {
  const n = a.length
  const m = b.length
  if (Math.abs(n - m) > max) return max + 1
  if (m + 1 > rowA.length) {
    rowA = new Int32Array(m + 1)
    rowB = new Int32Array(m + 1)
    rowC = new Int32Array(m + 1)
  }
  let prev2 = rowA
  let prev = rowB
  let cur = rowC
  for (let j = 0; j <= m; j++) prev[j] = j
  for (let i = 1; i <= n; i++) {
    cur[0] = i
    let rowMin = i
    const ai = a.charCodeAt(i - 1)
    for (let j = 1; j <= m; j++) {
      const bj = b.charCodeAt(j - 1)
      const cost = ai === bj ? 0 : 1
      let v = prev[j]! + 1
      const ins = cur[j - 1]! + 1
      if (ins < v) v = ins
      const sub = prev[j - 1]! + cost
      if (sub < v) v = sub
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj) {
        const tr = prev2[j - 2]! + 1
        if (tr < v) v = tr
      }
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    const t = prev2
    prev2 = prev
    prev = cur
    cur = t
  }
  return prev[m]!
}

/**
 * Distance between a typed term and an indexed word, also allowing the term to be a
 * (misspelt) beginning of the word – people often type only part of a name.
 */
export function fuzzyDistance(term: string, token: string, max: number): number {
  if (!couldBeClose(term, token, max)) return max + 1
  let best = editDistance(term, token, max)
  if (best === 0) return 0
  const tl = term.length
  if (tl < 5) return best // prefix matching on very short words finds too much nonsense
  for (let len = tl - 1; len <= tl + 1; len++) {
    if (len < 3 || len >= token.length) continue
    const d = editDistance(term, token.slice(0, len), max)
    if (d < best) best = d
    if (best === 0) break
  }
  return best
}

/**
 * Cheap pre-filter: within edit distance `max`, the start of the two words must still share
 * a character near the beginning. Rejects most of the vocabulary before the real distance.
 */
export function couldBeClose(term: string, token: string, max: number): boolean {
  const span = max + 1
  for (let i = 0; i < span && i < term.length; i++) {
    const c = term.charCodeAt(i)
    for (let j = 0; j <= span && j < token.length; j++) {
      if (token.charCodeAt(j) === c) return true
    }
  }
  return false
}
