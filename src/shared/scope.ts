import type { ScopeItem, ScopeTreeSource } from './types'

/** A node of the scope tree (folder/file source → file → sheet). */
export type ScopeNode =
  | { type: 'source'; path: string }
  | { type: 'file'; path: string; source: string }
  | { type: 'sheet'; path: string; sheet: string; source: string }

const same = (a: ScopeItem, b: ScopeItem): boolean =>
  a.type === b.type && a.path === b.path && (a.type !== 'sheet' || (b.type === 'sheet' && a.sheet === b.sheet))

export const toItem = (n: ScopeNode): ScopeItem =>
  n.type === 'sheet' ? { type: 'sheet', path: n.path, sheet: n.sheet } : { type: n.type, path: n.path }

/** Is the node selected explicitly or through a selected parent? */
export function isChecked(scope: ScopeItem[], n: ScopeNode): boolean {
  if (scope.some((s) => same(s, toItem(n)))) return true
  if (n.type === 'source') return false
  if (scope.some((s) => s.type === 'source' && s.path === n.source)) return true
  if (n.type === 'sheet') return scope.some((s) => s.type === 'file' && s.path === n.path)
  return false
}

/** Some, but not all, of the node's children are selected (checkbox shows a dash). */
export function isPartial(scope: ScopeItem[], n: ScopeNode, tree: ScopeTreeSource[]): boolean {
  if (isChecked(scope, n) || n.type === 'sheet') return false
  if (n.type === 'file') return scope.some((s) => s.type === 'sheet' && s.path === n.path)
  const src = tree.find((t) => t.path === n.path)
  const files = new Set(src?.files.map((f) => f.path) ?? [])
  return scope.some((s) => s.type !== 'source' && files.has(s.path))
}

/** Toggle a node, keeping the selection minimal and consistent. */
export function toggle(scope: ScopeItem[], n: ScopeNode, tree: ScopeTreeSource[]): ScopeItem[] {
  const src = tree.find((t) => t.path === (n.type === 'source' ? n.path : n.source))
  if (!isChecked(scope, n)) {
    // select it and drop now-redundant descendants
    let next = scope.filter((s) => {
      if (n.type === 'source') return !(s.type !== 'source' && src?.files.some((f) => f.path === s.path))
      if (n.type === 'file') return !(s.type === 'sheet' && s.path === n.path)
      return true
    })
    next = [...next, toItem(n)]
    return next
  }
  if (scope.some((s) => same(s, toItem(n)))) return scope.filter((s) => !same(s, toItem(n)))

  // Implied by a parent: replace the parent by its other children.
  let next = [...scope]
  const file = src?.files.find((f) => f.path === n.path)
  const sourceSelected = next.some((s) => s.type === 'source' && s.path === src?.path)
  if (sourceSelected && src) {
    next = next.filter((s) => !(s.type === 'source' && s.path === src.path))
    for (const f of src.files) if (f.path !== n.path) next.push({ type: 'file', path: f.path })
    if (n.type === 'sheet' && file) {
      for (const sh of file.sheets) if (sh.name !== n.sheet) next.push({ type: 'sheet', path: file.path, sheet: sh.name })
    }
    return next
  }
  if (n.type === 'sheet' && file) {
    next = next.filter((s) => !(s.type === 'file' && s.path === file.path))
    for (const sh of file.sheets) if (sh.name !== n.sheet) next.push({ type: 'sheet', path: file.path, sheet: sh.name })
  }
  return next
}

/** Short label for the scope button. */
export function scopeLabel(
  scope: ScopeItem[],
  tree: ScopeTreeSource[],
  t: { all: string; count: (n: number) => string }
): string {
  if (scope.length === 0) return t.all
  if (scope.length === 1) {
    const item = scope[0]!
    const name = item.path.split(/[\\/]/).pop() ?? item.path
    if (item.type === 'sheet') return `${name} › ${item.sheet}`
    const src = tree.find((s) => s.path === item.path)
    return src?.name ?? name
  }
  return t.count(scope.length)
}
