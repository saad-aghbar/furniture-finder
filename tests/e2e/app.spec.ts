/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import type {} from '../../src/preload/api'
import { FIXTURES, SHOTS, addSources, barBounds, isDragging, launch, readClipboard, waitIndexed, windowFor, type Launched } from './helpers'

let ctx: Launched
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  ctx = await launch()
})
test.afterAll(async () => {
  await ctx?.close()
})

/** Screenshot after animations settle (used for review and the README). */
const shot = async (page: Page, name: string): Promise<Buffer> => {
  await page.waitForTimeout(900)
  return page.screenshot({ path: join(SHOTS, `${name}.png`) })
}

let bar: Page

test('onboarding: language → files → indexing → done', async () => {
  const ob = await windowFor(ctx.app, 'onboarding')
  await expect(ob.getByRole('radiogroup')).toBeVisible()
  await ob.getByRole('radio', { name: 'English' }).click()
  await expect(ob.locator('html')).toHaveAttribute('dir', 'ltr')
  await shot(ob, '01-language')

  // switching language mirrors the UI
  await ob.getByRole('radio', { name: 'עברית' }).click()
  await expect(ob.locator('html')).toHaveAttribute('dir', 'rtl')
  await shot(ob, '01-language-he')
  await ob.getByRole('radio', { name: 'English' }).click()
  await expect(ob.locator('html')).toHaveAttribute('dir', 'ltr')

  await ob.getByRole('button', { name: 'Next' }).click()
  await expect(ob.getByText('Drag folders or Excel files here')).toBeVisible()
  // (drag & drop and the folder dialog both end in sources:add – call it directly)
  await addSources(ctx.app, [FIXTURES])
  await expect(ob.getByText('catalogue', { exact: true })).toBeVisible()
  await expect(ob.getByText(/Found 14 Excel files/)).toBeVisible()
  await expect(ob.getByText(/skipped 2 other files/)).toBeVisible()
  await shot(ob, '02-files')

  await ob.getByRole('button', { name: 'Read my files' }).click()
  // the fixtures include a damaged and a password-protected file: reported, not fatal
  await expect(ob.getByText('Some files could not be read')).toBeVisible({ timeout: 60_000 })
  await expect(ob.getByText(/has a password/)).toBeVisible()
  await expect(ob.getByText(/seems damaged/)).toBeVisible()
  await shot(ob, '03-indexing-errors')
  await ob.getByRole('button', { name: 'Next' }).click()
  await expect(ob.getByText('All set!')).toBeVisible()
  await shot(ob, '04-done')
  await ob.getByRole('button', { name: 'Start searching' }).click()

  bar = await windowFor(ctx.app, 'bar')
  await expect(bar.getByRole('combobox')).toBeVisible()
})

async function search(q: string): Promise<void> {
  const input = bar.getByRole('combobox')
  await input.fill(q)
  await expect(bar.getByRole('listbox')).toBeVisible()
}

test('search in Hebrew, Arabic, English and mixed', async () => {
  await waitIndexed(ctx.app)
  await search('כורס')
  await expect(bar.getByRole('option').first()).toContainText('כורסה')
  await expect(bar.getByText(/results ·/)).toBeVisible()
  await shot(bar, '05-search-he')

  await search('كنب')
  await expect(bar.getByRole('option', { name: /كَنَبَة/ }).first()).toBeVisible()
  await shot(bar, '06-search-ar')

  await search('oak table')
  await expect(bar.getByRole('option').first()).toContainText('Oak dining table')
  await expect(bar.getByRole('option').filter({ hasText: 'Suppliers 2026.xlsx' }).first()).toBeVisible()

  await search('sofa ספה')
  await expect(bar.getByRole('option').first()).toContainText('Sofa')

  await search('A-12')
  await expect(bar.getByRole('option', { name: /A-1203/ }).first()).toBeVisible()

  await search('recliner chiar')
  await expect(bar.getByText('Similar spelling').first()).toBeVisible()

  await search('zzzzqqq')
  await expect(bar.getByText(/Nothing found/)).toBeVisible()
  await shot(bar, '07-no-results')
})

test('scope: pick one file, label + dot, persists', async () => {
  await search('ספה')
  const before = await bar.getByRole('option').count()
  await bar.getByRole('button', { name: 'All files' }).click()
  await expect(bar.getByRole('tree')).toBeVisible()
  await shot(bar, '08-scope-open')
  await bar.getByRole('treeitem', { name: /קטלוג רהיטים\.xlsx/ }).click()
  await bar.keyboard.press('Escape')
  await bar.getByRole('combobox').click()
  const scopeButton = bar.locator('button[aria-haspopup="dialog"]')
  await expect(scopeButton).toHaveText(/קטלוג רהיטים\.xlsx/)
  await search('ספה')
  await expect.poll(() => bar.getByRole('option').count()).toBeLessThan(before)
  const scope = await bar.evaluate(() => window.ff.invoke('settings:get').then((s) => s.scope))
  expect(scope).toEqual([{ type: 'file', path: join(FIXTURES, 'קטלוג רהיטים.xlsx') }])
  await shot(bar, '09-scoped')
  // back to all files
  await bar.evaluate(() => window.ff.invoke('settings:set', { scope: [] }))
  await expect(bar.locator('button[aria-haspopup="dialog"]')).toHaveText('All files')
})

test('copy: card copies the row as table + readable text, chip copies a value', async () => {
  await search('כורסה מסתובבת')
  const card = bar.getByRole('option').filter({ hasText: 'קטלוג רהיטים.xlsx' }).first()
  await card.locator('span', { hasText: 'כורסה מסתובבת' }).first().click()
  await expect(card.getByText('Copied')).toBeVisible()
  await shot(bar, '10-copied')
  const clip = await readClipboard(ctx.app)
  expect(clip.text).toContain('שם מוצר: כורסה מסתובבת')
  expect(clip.text).toContain('קוד: A-1203')
  expect(clip.html).toContain('<td>A-1203</td><td>כורסה מסתובבת</td>')

  await card.getByRole('button', { name: /מחיר/ }).click()
  expect((await readClipboard(ctx.app)).text).toMatch(/^2,490\.00 ₪$/)

  // keyboard: ↓ selects, Enter copies
  await bar.getByRole('combobox').focus()
  await bar.keyboard.press('ArrowDown')
  await expect(bar.getByRole('option', { selected: true })).toHaveCount(1)
  await bar.keyboard.press('Enter')
  await expect(bar.getByRole('option', { selected: true }).getByText('Copied')).toBeVisible()
})

test('move bar: snap positions, move mode, position remembered', async () => {
  await bar.getByRole('combobox').fill('')
  const start = await barBounds(ctx.app)
  await bar.getByRole('button', { name: 'More options' }).click()
  await expect(bar.getByRole('menu')).toBeVisible()
  await shot(bar, '11-menu')
  await bar.getByRole('menuitem', { name: 'Bottom centre' }).click()
  // the spring settles, then the position is saved
  const savedY = (): Promise<number | undefined> => bar.evaluate(() => window.ff.invoke('settings:get').then((s) => s.bar?.y))
  await expect.poll(savedY, { timeout: 5000 }).toBeGreaterThan(start.y + 100)
  const moved = await barBounds(ctx.app)
  expect(await savedY()).toBe(moved.y)

  // move mode: outline shows, Esc cancels back to where it was
  await bar.getByRole('button', { name: 'More options' }).click()
  await bar.getByRole('menuitem', { name: 'Move bar' }).click()
  await expect(bar.getByText(/Drag the bar anywhere/)).toBeVisible()
  await shot(bar, '12-move-mode')
  await bar.keyboard.press('Escape')
  await expect(bar.getByText(/Drag the bar anywhere/)).toBeHidden()

  await bar.getByRole('button', { name: 'More options' }).click()
  await bar.getByRole('menuitem', { name: 'Top centre' }).click()
  await expect.poll(async () => (await barBounds(ctx.app)).y, { timeout: 5000 }).toBeLessThan(moved.y)
})

test('press and hold ⋯ picks the bar up instead of opening the menu', async () => {
  const more = bar.getByRole('button', { name: 'More options' })
  const box = (await more.boundingBox())!
  await bar.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await bar.mouse.down()
  await expect.poll(() => isDragging(ctx.app)).toBe(true)
  await bar.mouse.up()
  await expect.poll(() => isDragging(ctx.app)).toBe(false)
  await expect(bar.getByRole('menu')).toBeHidden()
  // a quick click still opens the menu
  await more.click()
  await expect(bar.getByRole('menu')).toBeVisible()
  await bar.keyboard.press('Escape')
})

test('RTL: Hebrew UI mirrors the bar', async () => {
  await bar.evaluate(() => window.ff.invoke('settings:set', { language: 'he' }))
  await expect(bar.locator('html')).toHaveAttribute('dir', 'rtl')
  await search('שולחן')
  await expect(bar.getByText(/תוצאות/)).toBeVisible()
  await shot(bar, '13-rtl-he')
  await bar.evaluate(() => window.ff.invoke('settings:set', { language: 'ar', theme: 'dark' }))
  await search('طاولة')
  await expect(bar.locator('html')).toHaveAttribute('dir', 'rtl')
  await shot(bar, '14-rtl-ar-dark')
  await bar.evaluate(() => window.ff.invoke('settings:set', { language: 'en', theme: 'system' }))
})

test('settings window opens and changes apply', async () => {
  await bar.evaluate(() => window.ff.invoke('app:open-window', 'settings'))
  const st = await windowFor(ctx.app, 'settings')
  await expect(st.getByRole('tab', { name: 'General' })).toBeVisible()
  await shot(st, '15-settings')
  await st.getByRole('tab', { name: 'Appearance' }).click()
  await st.getByRole('radio', { name: 'Extra large' }).click()
  await expect(bar.locator('html')).toHaveAttribute('data-text-size', 'xlarge')
  await shot(st, '16-settings-appearance')
  await st.getByRole('radio', { name: 'Large', exact: true }).click()
})
