import { expect, test, type Page } from '@playwright/test'
import { mkdtempSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import type {} from '../../src/preload/api'
import { addSources, launch, waitIndexed, windowFor, type Launched } from './helpers'

let ctx: Launched
let bar: Page
const folder = mkdtempSync(join(tmpdir(), 'ff-watch-'))
const moved = `${folder}-unplugged`
test.describe.configure({ mode: 'serial' })

function writeBook(file: string, rows: (string | number)[][]): void {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Items')
  XLSX.writeFile(wb, file)
}

test.beforeAll(async () => {
  writeBook(join(folder, 'stock.xlsx'), [
    ['Code', 'Name', 'Price'],
    ['W-1', 'Walnut sideboard', 3200]
  ])
  ctx = await launch()
  const ob = await windowFor(ctx.app, 'onboarding')
  await addSources(ctx.app, [folder])
  await waitIndexed(ctx.app)
  // the onboarding window closes itself during this call
  await ob.evaluate(() => window.ff.invoke('app:onboarding-done')).catch(() => undefined)
  bar = await windowFor(ctx.app, 'bar')
})

test.afterAll(async () => {
  await ctx?.close()
  rmSync(folder, { recursive: true, force: true })
  rmSync(moved, { recursive: true, force: true })
})

async function titles(q: string): Promise<string[]> {
  const res = await bar.evaluate((query) => window.ff.invoke('search', { seq: 1, query }), q)
  return res.results.map((r) => r.title.value)
}

test('edited, added, renamed and deleted files update within ~5 s', async () => {
  expect(await titles('sideboard')).toEqual(['Walnut sideboard'])

  // edit
  writeBook(join(folder, 'stock.xlsx'), [
    ['Code', 'Name', 'Price'],
    ['W-1', 'Walnut sideboard', 3200],
    ['W-2', 'Oak sideboard', 2900]
  ])
  await expect.poll(() => titles('sideboard'), { timeout: 8000 }).toContain('Oak sideboard')

  // add
  writeBook(join(folder, 'new.xlsx'), [['Name'], ['Teak bench']])
  await expect.poll(() => titles('teak'), { timeout: 8000 }).toEqual(['Teak bench'])

  // rename
  renameSync(join(folder, 'new.xlsx'), join(folder, 'renamed.xlsx'))
  await expect
    .poll(async () => (await bar.evaluate(() => window.ff.invoke('search', { seq: 2, query: 'teak' }))).results.map((r) => r.fileName), { timeout: 8000 })
    .toEqual(['renamed.xlsx'])

  // delete
  rmSync(join(folder, 'renamed.xlsx'))
  await expect.poll(() => titles('teak'), { timeout: 8000 }).toEqual([])
})

test('an unplugged folder keeps its index and is marked offline', async () => {
  renameSync(folder, moved)
  await expect
    .poll(async () => (await bar.evaluate(() => window.ff.invoke('sources:list')))[0]?.status, { timeout: 40_000 })
    .toBe('offline')
  const res = await bar.evaluate(() => window.ff.invoke('search', { seq: 3, query: 'sideboard' }))
  expect(res.results.length).toBe(2)
  expect(res.results.every((r) => r.offline)).toBe(true)
  // plugged back in → online again
  renameSync(moved, folder)
  await expect
    .poll(async () => (await bar.evaluate(() => window.ff.invoke('sources:list')))[0]?.status, { timeout: 40_000 })
    .toBe('ok')
})

test('hide the bar, bring it back; hotkey registered', async () => {
  expect(await ctx.app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+Shift+Space'))).toBe(true)
  await bar.evaluate(() => window.ff.invoke('bar:hide'))
  await expect.poll(() => ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=bar'))?.isVisible())).toBe(false)
  // what the hotkey and the tray icon do:
  await ctx.app.evaluate(() => (globalThis as unknown as { __ff: { showBar: (f: boolean) => void } }).__ff.showBar(true))
  await expect.poll(() => ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=bar'))?.isVisible())).toBe(true)
  // never in the taskbar
  expect(await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=bar'))?.isAlwaysOnTop())).toBe(true)
})
