import { z } from 'zod'
import type { InvokeChannel } from '../../shared/ipc'

const lang = z.enum(['ar', 'he', 'en'])
const scopeItem = z.discriminatedUnion('type', [
  z.object({ type: z.literal('source'), path: z.string().min(1).max(4096) }),
  z.object({ type: z.literal('file'), path: z.string().min(1).max(4096) }),
  z.object({ type: z.literal('sheet'), path: z.string().min(1).max(4096), sheet: z.string().max(512) })
])

/** Settings the renderer may change. Sources and bar position are owned by main. */
export const settingsPatch = z
  .object({
    language: lang,
    firstRunDone: z.boolean(),
    startWithWindows: z.boolean(),
    hotkey: z.string().min(3).max(64),
    showTray: z.boolean(),
    resultsPerPage: z.number().int().min(10).max(500),
    fuzzy: z.boolean(),
    copyHeaders: z.boolean(),
    recentSearchesOn: z.boolean(),
    theme: z.enum(['light', 'dark', 'system']),
    textSize: z.enum(['normal', 'large', 'xlarge']),
    idleOpacity: z.number().int().min(60).max(100),
    reduceMotion: z.enum(['system', 'on', 'off']),
    autoWatch: z.boolean(),
    scope: z.array(scopeItem).max(5000)
  })
  .partial()
  .strict()

const none = z.undefined().or(z.null())
const path = z.string().min(1).max(4096)
const copyCell = z.object({ header: z.string().max(10_000), value: z.string().max(100_000) })

export const schemas: Record<InvokeChannel, z.ZodType> = {
  'settings:get': none,
  'settings:set': settingsPatch,
  'sources:list': none,
  'sources:add': z.array(path).min(1).max(1000),
  'sources:remove': path,
  'sources:pick': z.enum(['folder', 'file']),
  'index:reindex': z.object({ force: z.boolean() }),
  'index:progress': none,
  'index:errors': none,
  search: z.object({ seq: z.number().int(), query: z.string().max(500), limit: z.number().int().min(1).max(1000).optional() }),
  'scope:tree': none,
  'recent:add': z.string().min(1).max(500),
  'recent:clear': none,
  'copy:row': z.object({ cells: z.array(copyCell).max(1000), withHeaders: z.boolean(), key: z.string().max(10_000) }),
  'copy:rows': z.object({
    title: z.string().max(10_000),
    rows: z.array(z.array(copyCell).max(1000)).min(1).max(200),
    withHeaders: z.boolean(),
    key: z.string().max(10_000)
  }),
  'copy:text': z.string().max(100_000),
  'excel:open': z.object({ filePath: path, sheet: z.string().max(512), row: z.number().int().min(1) }),
  'bar:layout': none,
  'bar:hover': z.boolean(),
  'bar:panel': z.boolean(),
  'bar:drag-start': none,
  'bar:drag-end': z.object({ cancel: z.boolean() }),
  'bar:resize-start': z.enum(['left', 'right']),
  'bar:resize-end': none,
  'bar:move-mode': z.boolean(),
  'bar:move-cancel': none,
  'bar:snap': z.enum(['top-center', 'top-left', 'top-right', 'bottom-center']),
  'bar:hide': none,
  'app:open-window': z.enum(['sources', 'settings']),
  'app:onboarding-done': none,
  'app:quit': none,
  'app:info': none,
  'app:check-updates': none,
  'app:install-update': none,
  'app:open-logs': none,
  'app:open-repo': none,
  'window:close': none,
  'window:minimize': none
}
