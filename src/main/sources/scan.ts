import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { EXCEL_EXTENSIONS } from '../../shared/types'
import type { FileStat } from '../../indexer/indexer'

const SKIP_DIRS = new Set(['$recycle.bin', 'system volume information', 'node_modules', '.git'])

/** Excel-like file we index? Ignores Office owner/lock files (~$…) and hidden dot-files. */
export function isIndexable(path: string): boolean {
  const name = basename(path)
  if (name.startsWith('~$') || name.startsWith('.')) return false
  return (EXCEL_EXTENSIONS as readonly string[]).includes(extname(name).toLowerCase())
}

export interface ScanResult {
  exists: boolean
  files: FileStat[]
  /** Other (non-Excel) files that were found and ignored. */
  skipped: number
}

/** Recursively list indexable files under a folder (or check a single file). */
export async function scanSource(path: string, kind: 'folder' | 'file'): Promise<ScanResult> {
  const files: FileStat[] = []
  let skipped = 0
  try {
    const st = await fs.stat(path)
    if (kind === 'file' || st.isFile()) {
      if (!st.isFile()) return { exists: false, files, skipped }
      return { exists: true, files: [{ path, size: st.size, mtime: Math.floor(st.mtimeMs) }], skipped }
    }
  } catch {
    return { exists: false, files, skipped }
  }

  const walk = async (dir: string): Promise<void> => {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return // unreadable sub-folder: skip quietly
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name.toLowerCase())) continue
        await walk(full)
      } else if (e.isFile()) {
        if (e.name.startsWith('~$') || e.name.startsWith('.')) continue
        if (!isIndexable(full)) {
          skipped++
          continue
        }
        try {
          const st = await fs.stat(full)
          files.push({ path: full, size: st.size, mtime: Math.floor(st.mtimeMs) })
        } catch {
          // vanished while scanning
        }
      }
    }
  }
  await walk(path)
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { exists: true, files, skipped }
}
