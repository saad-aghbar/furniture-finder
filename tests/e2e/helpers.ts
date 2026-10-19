import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const ROOT = resolve(__dirname, '..', '..')
export const FIXTURES = join(ROOT, 'tests', 'fixtures', 'catalogue')
export const SHOTS = join(ROOT, 'test-results', 'screens')

export interface Launched {
  app: ElectronApplication
  userData: string
  close: () => Promise<void>
}

/** Launch the built app (out/) with an isolated user-data folder. */
export async function launch(userData = mkdtempSync(join(tmpdir(), 'ff-e2e-'))): Promise<Launched> {
  const exe = process.env['FF_APP_EXE']
  const app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [ROOT] }),
    env: { ...process.env, FF_USER_DATA: userData, FF_E2E: '1', NODE_ENV: 'test' } as Record<string, string>
  })
  return {
    app,
    userData,
    close: async () => {
      await app.close().catch(() => undefined)
      rmSync(userData, { recursive: true, force: true, maxRetries: 5 })
    }
  }
}

/** Find (or wait for) the window showing a given renderer view. */
export async function windowFor(app: ElectronApplication, view: string, timeout = 20_000): Promise<Page> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const p of app.windows()) {
      if (p.url().includes(`view=${view}`)) {
        await p.waitForLoadState('domcontentloaded')
        return p
      }
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`no ${view} window`)
}

type FFMain = {
  sources: { add: (p: string[]) => Promise<unknown> }
  bar: { bounds: () => { x: number; y: number; width: number; height: number }; isDragging: () => boolean; dragCount: number }
  host: { progress: () => { running: boolean } }
}

export async function addSources(app: ElectronApplication, paths: string[]): Promise<void> {
  await app.evaluate(async (_e, p) => {
    await (globalThis as unknown as { __ff: FFMain }).__ff.sources.add(p)
  }, paths)
}

export async function barBounds(app: ElectronApplication): Promise<{ x: number; y: number; width: number; height: number }> {
  return app.evaluate(() => (globalThis as unknown as { __ff: FFMain }).__ff.bar.bounds())
}

export async function readClipboard(app: ElectronApplication): Promise<{ text: string; html: string }> {
  return app.evaluate(async ({ clipboard }) => {
    const items = await clipboard.read()
    const item = items[0]
    const get = async (type: string): Promise<string> => {
      if (!item || !item.types.includes(type)) return ''
      const blob = (await item.getType(type)) as Blob
      return blob.text()
    }
    return { text: await clipboard.readText(), html: await get('text/html') }
  })
}

export async function waitIndexed(app: ElectronApplication): Promise<void> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const running = await app.evaluate(() => (globalThis as unknown as { __ff: FFMain }).__ff.host.progress().running)
    if (!running) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('indexing did not finish')
}

export async function dragCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(() => (globalThis as unknown as { __ff: FFMain }).__ff.bar.dragCount)
}

export async function isDragging(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(() => (globalThis as unknown as { __ff: FFMain }).__ff.bar.isDragging())
}
