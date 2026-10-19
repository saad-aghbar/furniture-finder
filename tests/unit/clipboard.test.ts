import { describe, expect, it } from 'vitest'
import { formatRow, formatTsv } from '../../src/main/clipboard-format'

const cells = [
  { header: 'קוד', value: 'A-1203' },
  { header: 'שם מוצר', value: 'כורסה מסתובבת' },
  { header: 'מחיר', value: '2,490.00 ₪' },
  { header: 'Note', value: '' }
]

describe('clipboard formatting', () => {
  it('writes readable Header: value lines for WhatsApp / Notepad', () => {
    expect(formatRow(cells, false).text).toBe('קוד: A-1203\nשם מוצר: כורסה מסתובבת\nמחיר: 2,490.00 ₪')
  })
  it('writes a one-row HTML table for Excel', () => {
    const { html } = formatRow(cells, false)
    expect(html).toContain('<table><tr><td>A-1203</td><td>כורסה מסתובבת</td><td>2,490.00 ₪</td></tr></table>')
    expect(html).not.toContain('<th>')
  })
  it('adds a header row when asked', () => {
    expect(formatRow(cells, true).html).toContain('<tr><th>קוד</th><th>שם מוצר</th><th>מחיר</th></tr>')
  })
  it('escapes HTML and keeps date-like codes as text', () => {
    const { html } = formatRow([{ header: 'x', value: '<b>&' }, { header: 'y', value: '12/3' }], false)
    expect(html).toContain('&lt;b&gt;&amp;')
    expect(html).toContain("mso-number-format:'\\@'")
  })
  it('omits empty headers in text', () => {
    expect(formatRow([{ header: '', value: 'Sofa' }], false).text).toBe('Sofa')
  })
  it('builds TSV', () => {
    expect(formatTsv(cells, true)).toBe('קוד\tשם מוצר\tמחיר\nA-1203\tכורסה מסתובבת\t2,490.00 ₪')
  })
})
