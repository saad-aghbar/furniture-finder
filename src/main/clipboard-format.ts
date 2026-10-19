import type { CopyCell } from '../shared/ipc'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Values Excel would otherwise turn into dates or numbers (codes like 1/2, A-12, 0012). */
const keepAsText = (v: string): boolean => /^0\d/.test(v) || /^\d+[-/]\d+([-/]\d+)?$/.test(v)

export interface ClipboardPayload {
  /** Plain text: "Header: value" lines (WhatsApp, email, Notepad). */
  text: string
  /** HTML table: pastes into Excel as cells in one row. */
  html: string
}

/**
 * Build the clipboard content for a whole row. Excel picks the HTML table (cells in a row,
 * optional header row); chat apps and Notepad pick the readable text lines.
 */
export function formatRow(cells: CopyCell[], withHeaders: boolean): ClipboardPayload {
  const filled = cells.filter((c) => c.value.trim().length > 0)
  const text = filled.map((c) => (c.header ? `${c.header}: ${c.value}` : c.value)).join('\n')
  const td = (v: string, tag: 'td' | 'th'): string =>
    `<${tag}${keepAsText(v) ? ' style="mso-number-format:\'\\@\'"' : ''}>${esc(v)}</${tag}>`
  const headerRow = withHeaders ? `<tr>${filled.map((c) => td(c.header, 'th')).join('')}</tr>` : ''
  const valueRow = `<tr>${filled.map((c) => td(c.value, 'td')).join('')}</tr>`
  const html =
    '<html><head><meta charset="utf-8"></head><body>' +
    `<table>${headerRow}${valueRow}</table></body></html>`
  return { text, html }
}

/** Tab-separated variant (one row, optional header row), used in tests and as a fallback. */
export function formatTsv(cells: CopyCell[], withHeaders: boolean): string {
  const filled = cells.filter((c) => c.value.trim().length > 0)
  const clean = (s: string): string => s.replace(/[\t\r\n]+/g, ' ')
  const values = filled.map((c) => clean(c.value)).join('\t')
  return withHeaders ? `${filled.map((c) => clean(c.header)).join('\t')}\n${values}` : values
}
