/**
 * Text normalisation shared by the indexer and the search box.
 * Steps: NFKD, lower-case, drop combining marks / format chars / tatweel, fold letter
 * variants and digits, punctuation → space (code separators kept inside codes), collapse spaces.
 * Both sides MUST use the same function, otherwise queries stop matching the index.
 * Bump NORMALIZER_VERSION whenever the output of normalize() changes; the index is
 * rebuilt automatically when the stored version differs.
 */
export const NORMALIZER_VERSION = 5

/** Single-character folds applied after NFKC + lower-casing. */
const FOLD: Record<string, string> = {
  // Arabic letter variants
  'أ': 'ا',
  'إ': 'ا',
  'آ': 'ا',
  'ٱ': 'ا',
  'ة': 'ه',
  'ى': 'ي',
  'ؤ': 'و',
  'ئ': 'ي',
  // Persian / Urdu forms often typed on non-Arabic keyboards
  'ک': 'ك',
  'ی': 'ي',
  // Hebrew final letters
  'ך': 'כ',
  'ם': 'מ',
  'ן': 'נ',
  'ף': 'פ',
  'ץ': 'צ'
}

const TATWEEL = 'ـ'
/** Hebrew geresh/gershayim and ASCII/typographic quotes: dropped inside words (מע"מ → מעמ). */
const INWORD_QUOTES = new Set(['׳', '״', "'", '"', '’', '‘', '`', '´'])
/** Kept inside codes such as A-12/3 or 1.5 */
const CODE_SEPARATORS = new Set(['-', '/', '.'])
/** Thousands separators: dropped between digits so "3,850" matches "3850" (and "3,850"). */
const THOUSANDS = new Set([',', '\u066C', '\u2009', '\u202F'])

const RE_MARK = /\p{M}/u
const RE_FORMAT = /\p{Cf}/u
const RE_ALNUM = /[\p{L}\p{N}]/u

function foldDigit(ch: string): string {
  const c = ch.charCodeAt(0)
  if (c >= 0x0660 && c <= 0x0669) return String.fromCharCode(c - 0x0660 + 48)
  if (c >= 0x06f0 && c <= 0x06f9) return String.fromCharCode(c - 0x06f0 + 48)
  return ch
}

export interface NormalizedText {
  /** The normalised string. */
  text: string
  /** For each UTF-16 unit of `text`: start offset of the source character in the original. */
  starts: number[]
  /** For each UTF-16 unit of `text`: end offset (exclusive) of the source character. */
  ends: number[]
}

type Kind = 'char' | 'space' | 'sep' | 'quote' | 'thousands'
interface Piece {
  ch: string
  kind: Kind
  start: number
  end: number
}

/** Normalise and keep a map from every output character back to the original text. */
export function normalizeWithMap(input: string): NormalizedText {
  const pieces: Piece[] = []
  // Pass 1: per source code point → NFKC → lower → strip / fold, classify.
  let i = 0
  while (i < input.length) {
    const cp = input.codePointAt(i)!
    const src = String.fromCodePoint(cp)
    const start = i
    const end = i + src.length
    i = end
    // NFKD (compatibility decomposition) so accents, tashkeel, niqqud and hamza seats become
    // separate combining marks that we can drop.
    const expanded = src.normalize('NFKD').toLowerCase()
    for (const raw of expanded) {
      if (RE_MARK.test(raw) || RE_FORMAT.test(raw) || raw === TATWEEL) {
        // A dropped mark belongs to the previous letter: extend its source range so highlights
        // cover the whole written letter including its vowel signs.
        const last = pieces[pieces.length - 1]
        if (last && last.end === start && RE_MARK.test(raw)) last.end = end
        continue
      }
      let ch = FOLD[raw] ?? raw
      ch = foldDigit(ch)
      let kind: Kind
      if (RE_ALNUM.test(ch)) kind = 'char'
      else if (CODE_SEPARATORS.has(ch)) kind = 'sep'
      else if (INWORD_QUOTES.has(ch)) kind = 'quote'
      else if (THOUSANDS.has(raw)) kind = 'thousands'
      else kind = 'space'
      pieces.push({ ch, kind, start, end })
    }
  }

  // Pass 2: resolve separators/quotes using neighbours, collapse whitespace.
  let text = ''
  const starts: number[] = []
  const ends: number[] = []
  let pendingSpace = false
  const isAlnum = (p: Piece | undefined): boolean => p !== undefined && p.kind === 'char'
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k]!
    let emit: 'char' | 'space' | 'drop' = 'char'
    const isDigit = (q: Piece | undefined): boolean => q !== undefined && q.ch >= '0' && q.ch <= '9'
    if (p.kind === 'space') emit = 'space'
    else if (p.kind === 'thousands') {
      emit = isDigit(pieces[k - 1]) && isDigit(pieces[k + 1]) ? 'drop' : 'space'
    }
    else if (p.kind === 'quote') {
      emit = isAlnum(pieces[k - 1]) && isAlnum(pieces[k + 1]) ? 'drop' : 'space'
    } else if (p.kind === 'sep') {
      emit = isAlnum(pieces[k - 1]) && isAlnum(pieces[k + 1]) ? 'char' : 'space'
    }
    if (emit === 'drop') continue
    if (emit === 'space') {
      if (text.length > 0) pendingSpace = true
      continue
    }
    if (pendingSpace) {
      text += ' '
      // a space maps to the gap between the previous and this character
      starts.push(p.start)
      ends.push(p.start)
      pendingSpace = false
    }
    for (let u = 0; u < p.ch.length; u++) {
      starts.push(p.start)
      ends.push(p.end)
    }
    text += p.ch
  }
  return { text, starts, ends }
}

/** Normalise text for indexing or searching. */
export function normalize(input: string): string {
  return normalizeWithMap(input).text
}

/**
 * Extra index-only variants: tokens containing code separators are also indexed with
 * the separators removed, so "A-12/3" can be found by typing "A123".
 */
export function codeVariants(normalized: string): string[] {
  const out: string[] = []
  for (const tok of normalized.split(' ')) {
    if (/[-/.]/.test(tok) && /\d/.test(tok)) {
      const compact = tok.replace(/[-/.]/g, '')
      if (compact.length > 0) out.push(compact)
    }
  }
  return out
}

/** Full text stored in the FTS index for a row (normalised cells + code variants). */
export function indexText(cells: readonly string[]): string {
  const norm = normalize(cells.filter((c) => c.length > 0).join(' '))
  const variants = codeVariants(norm)
  return variants.length ? `${norm} ${variants.join(' ')}` : norm
}

/** Distinct word tokens of length ≥ 4, used for typo tolerance. */
export function fuzzyTokens(normalized: string): string[] {
  const set = new Set<string>()
  for (const tok of normalized.split(' ')) {
    const len = [...tok].length
    if (len >= 4 && len <= 32 && !/^\d+$/.test(tok)) set.add(tok)
  }
  return [...set]
}

/** Map a range in normalised text back to the original text. */
export function mapRange(
  map: NormalizedText,
  from: number,
  to: number
): { start: number; end: number } | null {
  if (from >= to || from < 0 || to > map.text.length) return null
  return { start: map.starts[from]!, end: map.ends[to - 1]! }
}

/** Number of user-perceived characters (code points) – trigram needs ≥ 3. */
export function charLength(s: string): number {
  let n = 0
  for (const _ of s) n++
  return n
}
