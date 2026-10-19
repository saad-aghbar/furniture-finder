import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronRight, FileSpreadsheet, Folder, Minus, Sheet } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { isChecked, isPartial, toggle, type ScopeNode } from '@shared/scope'
import { normalize } from '@shared/normalize'
import type { ScopeItem, ScopeTreeSource } from '@shared/types'
import { useApp } from '../shared/AppProvider'
import { dur, fade, spring } from '../motion/tokens'
import s from './bar.module.css'

interface Props {
  tree: ScopeTreeSource[]
  scope: ScopeItem[]
  onChange: (scope: ScopeItem[]) => void
  maxHeight: number
}

function CheckBox({ checked, partial }: { checked: boolean; partial: boolean }): ReactNode {
  return (
    <span className={s.checkBox} aria-hidden style={partial ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}>
      {checked && <Check size={15} strokeWidth={3} />}
      {partial && !checked && <Minus size={15} strokeWidth={3} />}
    </span>
  )
}

/** Dropdown body: "All files" plus a folder → file → sheet tree with checkboxes and a filter box. */
export function ScopeMenu({ tree, scope, onChange, maxHeight }: Props): ReactNode {
  const { t, dir, reduceMotion } = useApp()
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set(tree.length === 1 ? [tree[0]!.path] : []))
  const treeRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    filterRef.current?.focus()
  }, [])

  const q = normalize(filter)
  const visible = useMemo(() => {
    if (!q) return tree
    return tree
      .map((src) => {
        const srcHit = normalize(src.name).includes(q)
        const files = srcHit ? src.files : src.files.filter((f) => normalize(f.relPath).includes(q) || f.sheets.some((sh) => normalize(sh.name).includes(q)))
        return { ...src, files }
      })
      .filter((src) => src.files.length > 0 || normalize(src.name).includes(q))
  }, [tree, q])

  const isOpen = (key: string): boolean => (q ? true : open.has(key))
  const flip = (key: string): void =>
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  const set = (n: ScopeNode): void => onChange(toggle(scope, n, tree))

  // Arrow keys move between rows, Right/Left (mirrored in RTL) open/close, typing goes to the filter.
  const onKeyDown = (e: KeyboardEvent): void => {
    const rows = Array.from(treeRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])
    const current = document.activeElement as HTMLElement | null
    const i = rows.findIndex((r) => r === current)
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
    const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      rows[Math.min(rows.length - 1, i + 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (i <= 0) filterRef.current?.focus()
      else rows[i - 1]?.focus()
    } else if ((e.key === forward || e.key === back) && current?.dataset['key']) {
      const key = current.dataset['key']
      if ((e.key === forward) !== open.has(key)) {
        e.preventDefault()
        flip(key)
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && e.key !== ' ' && current !== filterRef.current) {
      filterRef.current?.focus()
    }
  }

  const count = scope.length
  const expandAnim = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade }
    : {
        initial: { height: 0, opacity: 0 },
        animate: { height: 'auto', opacity: 1 },
        exit: { height: 0, opacity: 0 },
        transition: { ...spring.smooth, opacity: { duration: dur.sm } }
      }

  return (
    <div className={s.scopeMenu} style={{ maxHeight }} onKeyDown={onKeyDown}>
      <div className={s.scopeHeader}>
        <span>{t('bar.scopeTitle')}</span>
        <AnimatePresence mode="popLayout">
          {count > 0 && (
            <motion.span
              key={count}
              className={`${s.countBadge} num`}
              initial={reduceMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: dur.xs } }}
              transition={reduceMotion ? fade : spring.snappy}
            >
              {count}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <input
        ref={filterRef}
        className={s.filter}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t('bar.scopeFilter')}
        aria-label={t('bar.scopeFilter')}
        dir="auto"
      />
      <div className={s.tree} ref={treeRef} role="tree" aria-multiselectable>
        <div className={s.treeRow}>
          <span className={s.treeSpacer} />
          <button type="button" role="treeitem" aria-checked={count === 0} className={s.check} data-row onClick={() => onChange([])}>
            <CheckBox checked={count === 0} partial={false} />
            <span className={s.treeName} style={{ fontWeight: 600 }}>
              {t('bar.scopeAll')}
            </span>
          </button>
        </div>
        {visible.length === 0 && <div className={s.scopeEmpty}>{t('bar.scopeNone')}</div>}
        {visible.map((src) => {
          const node: ScopeNode = { type: 'source', path: src.path }
          const single = src.kind === 'file'
          const file0 = single ? src.files[0] : undefined
          return (
            <div key={src.path}>
              <div className={s.treeRow}>
                {single && (file0?.sheets.length ?? 0) <= 1 ? (
                  <span className={s.treeSpacer} />
                ) : (
                  <button type="button" className={s.treeToggle} aria-expanded={isOpen(src.path)} onClick={() => flip(src.path)} tabIndex={-1} aria-label={src.name}>
                    <ChevronRight size={18} strokeWidth={2} />
                  </button>
                )}
                <button
                  type="button"
                  role="treeitem"
                  aria-checked={isChecked(scope, node)}
                  aria-expanded={single && (file0?.sheets.length ?? 0) <= 1 ? undefined : isOpen(src.path)}
                  className={s.check}
                  data-row
                  data-key={src.path}
                  onClick={() => set(node)}
                  title={src.path}
                >
                  <CheckBox checked={isChecked(scope, node)} partial={isPartial(scope, node, tree)} />
                  {single ? <FileSpreadsheet size={18} strokeWidth={1.75} className={s.treeIcon} /> : <Folder size={18} strokeWidth={1.75} className={s.treeIcon} />}
                  <bdi dir={src.kind === 'file' ? 'ltr' : undefined} className={s.treeName}>{src.name}</bdi>
                  {src.status === 'offline' && <span className={s.offlineTag}>{t('bar.offlineBadge')}</span>}
                  {!single && <span className={`${s.treeMeta} num`}>{t('bar.scopeCount', { count: src.files.length })}</span>}
                </button>
              </div>
              <AnimatePresence initial={false}>
                {isOpen(src.path) && (
                  <motion.div className={s.treeChildren} {...expandAnim}>
                    {single && file0
                      ? file0.sheets.map((sh) => <SheetRow key={sh.name} node={{ type: 'sheet', path: file0.path, sheet: sh.name, source: src.path }} rows={sh.rows} scope={scope} onToggle={set} />)
                      : src.files.map((f) => {
                          const fnode: ScopeNode = { type: 'file', path: f.path, source: src.path }
                          const fkey = `${src.path}\u0000${f.path}`
                          const multi = f.sheets.length > 1
                          return (
                            <div key={f.path}>
                              <div className={s.treeRow}>
                                {multi ? (
                                  <button type="button" className={s.treeToggle} aria-expanded={isOpen(fkey)} onClick={() => flip(fkey)} tabIndex={-1} aria-label={f.name}>
                                    <ChevronRight size={18} strokeWidth={2} />
                                  </button>
                                ) : (
                                  <span className={s.treeSpacer} />
                                )}
                                <button
                                  type="button"
                                  role="treeitem"
                                  aria-checked={isChecked(scope, fnode)}
                                  aria-expanded={multi ? isOpen(fkey) : undefined}
                                  className={s.check}
                                  data-row
                                  data-key={multi ? fkey : undefined}
                                  onClick={() => set(fnode)}
                                  title={f.path}
                                >
                                  <CheckBox checked={isChecked(scope, fnode)} partial={isPartial(scope, fnode, tree)} />
                                  <FileSpreadsheet size={18} strokeWidth={1.75} className={s.treeIcon} />
                                  <bdi dir="ltr" className={s.treeName}>{f.relPath}</bdi>
                                  {multi && <span className={`${s.treeMeta} num`}>{t('bar.scopeSheets', { count: f.sheets.length })}</span>}
                                </button>
                              </div>
                              <AnimatePresence initial={false}>
                                {multi && isOpen(fkey) && (
                                  <motion.div className={s.treeChildren} {...expandAnim}>
                                    {f.sheets.map((sh) => (
                                      <SheetRow key={sh.name} node={{ type: 'sheet', path: f.path, sheet: sh.name, source: src.path }} rows={sh.rows} scope={scope} onToggle={set} />
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )
                        })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SheetRow({ node, rows, scope, onToggle }: { node: ScopeNode & { type: 'sheet' }; rows: number; scope: ScopeItem[]; onToggle: (n: ScopeNode) => void }): ReactNode {
  const { t } = useApp()
  const checked = isChecked(scope, node)
  return (
    <div className={s.treeRow}>
      <span className={s.treeSpacer} />
      <button type="button" role="treeitem" aria-checked={checked} className={s.check} data-row onClick={() => onToggle(node)}>
        <CheckBox checked={checked} partial={false} />
        <Sheet size={17} strokeWidth={1.75} className={s.treeIcon} />
        <bdi className={s.treeName}>{node.sheet}</bdi>
        <span className={`${s.treeMeta} num`}>{t('bar.scopeRows', { count: rows })}</span>
      </button>
    </div>
  )
}
