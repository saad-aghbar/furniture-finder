import { AnimatePresence, motion } from 'motion/react'
import { FileSpreadsheet, FolderPlus, History, LoaderCircle, SearchX, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { IndexProgress, SearchResponse, SearchResult } from '@shared/types'
import { useApp } from '../shared/AppProvider'
import { dur, ease, fade, spring } from '../motion/tokens'
import { ResultCard } from './ResultCard'
import s from './results.module.css'

export type PanelMode = 'results' | 'noFiles' | 'recent' | null

interface Group {
  filePath: string
  fileName: string
  items: SearchResult[]
}

/** Results in display order: grouped by file (best file first) when several files match. */
export function groupResults(results: SearchResult[]): { groups: Group[]; flat: SearchResult[]; grouped: boolean } {
  const byFile = new Map<string, Group>()
  for (const r of results) {
    let g = byFile.get(r.filePath)
    if (!g) byFile.set(r.filePath, (g = { filePath: r.filePath, fileName: r.fileName, items: [] }))
    g.items.push(r)
  }
  const groups = [...byFile.values()]
  return { groups, flat: groups.flatMap((g) => g.items), grouped: groups.length > 1 }
}

interface Props {
  mode: PanelMode
  openUp: boolean
  style: CSSProperties
  maxHeight: number
  response: SearchResponse | null
  query: string
  selectedId: number | null
  onSelect: (id: number) => void
  progress: IndexProgress
  scopeLabel: string | null
  onSearchAll: () => void
  onClose: () => void
  onShowMore: () => void
  canShowMore: boolean
  onAddFiles: () => void
  recent: string[]
  onPickRecent: (q: string) => void
  onClearRecent: () => void
  copySignal: number
  openSignal: number
  onCopied: () => void
  /** Changes every time the panel opens, so cards stagger only then. */
  openKey: number
}

export function Results(props: Props): ReactNode {
  const { mode, openUp, style, maxHeight } = props
  const { reduceMotion } = useApp()
  const content = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)

  // Measure content and animate the panel height (one element, capped) – cards never jump.
  useLayoutEffect(() => {
    const el = content.current
    if (!el) return
    // The wrapper sizes itself to its content (capped by maxHeight); the panel follows it.
    const measure = (): void => setHeight(Math.min(el.offsetHeight, maxHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mode, maxHeight])

  const hidden = openUp ? 'inset(100% 0% 0% 0% round 20px)' : 'inset(0% 0% 100% 0% round 20px)'
  const shown = 'inset(0% 0% 0% 0% round 20px)'

  return (
    <AnimatePresence>
      {mode && (
        <motion.div
          key="panel"
          className={s.panel}
          style={{ ...style, maxHeight }}
          data-hit
          initial={reduceMotion ? { opacity: 0 } : { clipPath: hidden, opacity: 0 }}
          animate={{
            clipPath: shown,
            opacity: 1,
            height: height ?? 'auto'
          }}
          exit={
            reduceMotion
              ? { opacity: 0, transition: fade }
              : { clipPath: hidden, opacity: 0, transition: { duration: dur.sm, ease: ease.out } }
          }
          transition={reduceMotion ? { ...fade, height: { duration: 0 } } : { ...spring.smooth, opacity: { duration: dur.sm } }}
        >
          <div ref={content} style={{ display: 'flex', flexDirection: 'column', maxHeight }}>
            {mode === 'results' && <ResultsBody {...props} />}
            {mode === 'noFiles' && <NoFiles onAddFiles={props.onAddFiles} />}
            {mode === 'recent' && <Recent {...props} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ResultsBody(p: Props): ReactNode {
  const { t, reduceMotion, settings } = useApp()
  const r = p.response
  const { groups, grouped } = useMemo(() => groupResults(r?.results ?? []), [r])
  const pending = p.progress.running ? Math.max(0, p.progress.filesTotal - p.progress.filesDone) : 0
  const [staggerKey, setStaggerKey] = useState(p.openKey)
  // Stagger only for the first batch after the panel opens.
  const firstBatch = useRef(true)
  useEffect(() => {
    if (staggerKey !== p.openKey) {
      setStaggerKey(p.openKey)
      firstBatch.current = true
    }
  }, [p.openKey, staggerKey])
  useEffect(() => {
    if (r && r.results.length > 0) {
      const id = setTimeout(() => (firstBatch.current = false), 400)
      return () => clearTimeout(id)
    }
  }, [r])

  if (!r) {
    return (
      <div className={s.header}>
        <LoaderCircle size={16} className="spin" aria-hidden />
      </div>
    )
  }

  const countText = r.capped
    ? t('bar.resultsCapped', { count: r.total })
    : r.total === 1
      ? t('bar.resultsOne')
      : t('bar.results', { count: r.total })
  let index = 0

  return (
    <>
      <div className={s.header}>
        {r.results.length > 0 && (
          <span>
            <span className={`${s.count} num`}>{countText}</span>
            <span className="num"> · {t('bar.seconds', { s: Math.max(0.01, r.tookMs / 1000).toFixed(2) })}</span>
          </span>
        )}
        {pending > 0 && (
          <span className={s.reading}>
            <LoaderCircle size={14} className={reduceMotion ? undefined : 'spin'} aria-hidden />
            {t('bar.stillReading', { count: pending })}
          </span>
        )}
        <button type="button" className={s.closeButton} onClick={p.onClose} aria-label={t('bar.closeResults')} title={t('bar.closeResults')}>
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>

      {r.results.length === 0 ? (
        <div className={s.empty} role="status">
          <span className={s.emptyIcon}>
            <SearchX size={26} strokeWidth={1.75} aria-hidden />
          </span>
          <div className={s.emptyTitle}>{t('bar.noResults', { query: r.query })}</div>
          {p.scopeLabel ? (
            <>
              <div className={s.emptyBody}>{t('bar.onlyIn', { scope: p.scopeLabel })}</div>
              <button type="button" className={s.primary} onClick={p.onSearchAll}>
                {t('bar.searchAll')}
              </button>
            </>
          ) : (
            <div className={s.emptyBody}>{t('bar.tryFewer')}</div>
          )}
        </div>
      ) : (
        <div className={s.scroll} role="listbox" id="ff-results" aria-label={countText}>
          <AnimatePresence initial={false} mode="popLayout">
            {groups.map((g) => (
              <motion.div key={g.filePath} className={s.group} layout={reduceMotion ? false : 'position'} transition={spring.smooth}>
                {grouped && (
                  <div className={s.groupHeader}>
                    <FileSpreadsheet size={15} strokeWidth={1.75} aria-hidden />
                    <bdi dir="ltr" className={s.groupName}>{g.fileName}</bdi>
                    <span className={`${s.groupCount} num`}>{g.items.length}</span>
                  </div>
                )}
                <AnimatePresence initial={false} mode="popLayout">
                  {g.items.map((item) => {
                    const i = index++
                    return (
                      <ResultCard
                        key={item.rowId}
                        result={item}
                        selected={item.rowId === p.selectedId}
                        hlKey={p.query}
                        stagger={firstBatch.current ? i : null}
                        copyHeaders={settings.copyHeaders}
                        onSelect={p.onSelect}
                        onCopied={p.onCopied}
                        copySignal={p.copySignal}
                        openSignal={p.openSignal}
                      />
                    )
                  })}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
          {p.canShowMore && (
            <div className={s.showMore}>
              <button type="button" className={s.secondary} onClick={p.onShowMore}>
                {t('bar.showMore')}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function NoFiles({ onAddFiles }: { onAddFiles: () => void }): ReactNode {
  const { t } = useApp()
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>
        <FolderPlus size={26} strokeWidth={1.75} aria-hidden />
      </span>
      <div className={s.emptyBody}>{t('bar.noFiles')}</div>
      <button type="button" className={s.primary} onClick={onAddFiles}>
        <FolderPlus size={18} strokeWidth={1.75} aria-hidden />
        {t('bar.addFiles')}
      </button>
    </div>
  )
}

function Recent(p: Props): ReactNode {
  const { t } = useApp()
  return (
    <>
      <div className={s.recentTitle}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <History size={15} strokeWidth={1.75} aria-hidden />
          {t('bar.recent')}
        </span>
        <button type="button" className={s.linkButton} onClick={p.onClearRecent}>
          {t('bar.clearRecent')}
        </button>
      </div>
      <div className={s.recent}>
        {p.recent.map((q) => (
          <button key={q} type="button" className={s.recentChip} onClick={() => p.onPickRecent(q)}>
            <bdi>{q}</bdi>
          </button>
        ))}
      </div>
    </>
  )
}
