import { describe, expect, it } from 'vitest'
import { isChecked, isPartial, scopeLabel, toggle, type ScopeNode } from '../../src/shared/scope'
import type { ScopeItem, ScopeTreeSource } from '../../src/shared/types'

const tree: ScopeTreeSource[] = [
  {
    path: '/data',
    name: 'data',
    kind: 'folder',
    status: 'ok',
    files: [
      { path: '/data/a.xlsx', name: 'a.xlsx', relPath: 'a.xlsx', status: 'ok', sheets: [{ name: 'S1', rows: 3 }, { name: 'S2', rows: 2 }] },
      { path: '/data/b.xlsx', name: 'b.xlsx', relPath: 'b.xlsx', status: 'ok', sheets: [{ name: 'S1', rows: 1 }] }
    ]
  },
  { path: '/prices.xlsx', name: 'prices.xlsx', kind: 'file', status: 'ok', files: [{ path: '/prices.xlsx', name: 'prices.xlsx', relPath: 'prices.xlsx', status: 'ok', sheets: [{ name: 'P', rows: 9 }] }] }
]
const src: ScopeNode = { type: 'source', path: '/data' }
const fileA: ScopeNode = { type: 'file', path: '/data/a.xlsx', source: '/data' }
const sheetA1: ScopeNode = { type: 'sheet', path: '/data/a.xlsx', sheet: 'S1', source: '/data' }

describe('scope selection', () => {
  it('selects a folder and implies its files and sheets', () => {
    const s = toggle([], src, tree)
    expect(s).toEqual([{ type: 'source', path: '/data' }])
    expect(isChecked(s, fileA)).toBe(true)
    expect(isChecked(s, sheetA1)).toBe(true)
  })
  it('selecting a parent removes redundant children', () => {
    let s: ScopeItem[] = toggle([], sheetA1, tree)
    s = toggle(s, fileA, tree)
    expect(s).toEqual([{ type: 'file', path: '/data/a.xlsx' }])
  })
  it('unchecking an implied child replaces the parent by its siblings', () => {
    const s = toggle([{ type: 'source', path: '/data' }], sheetA1, tree)
    expect(s).toEqual(
      expect.arrayContaining([
        { type: 'file', path: '/data/b.xlsx' },
        { type: 'sheet', path: '/data/a.xlsx', sheet: 'S2' }
      ])
    )
    expect(s).toHaveLength(2)
    expect(isChecked(s, sheetA1)).toBe(false)
    expect(isPartial(s, src, tree)).toBe(true)
    expect(isPartial(s, fileA, tree)).toBe(true)
  })
  it('multi-selects and labels', () => {
    const t = { all: 'All files', count: (n: number) => `${n} files` }
    expect(scopeLabel([], tree, t)).toBe('All files')
    const one = toggle([], { type: 'file', path: '/prices.xlsx', source: '/prices.xlsx' }, tree)
    expect(scopeLabel(one, tree, t)).toBe('prices.xlsx')
    expect(scopeLabel(toggle(one, fileA, tree), tree, t)).toBe('2 files')
    expect(scopeLabel([{ type: 'sheet', path: '/data/a.xlsx', sheet: 'S1' }], tree, t)).toBe('a.xlsx › S1')
  })
  it('unchecks explicit items', () => {
    expect(toggle([{ type: 'file', path: '/data/a.xlsx' }], fileA, tree)).toEqual([])
  })
})
