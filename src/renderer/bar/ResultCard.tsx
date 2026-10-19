import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { Copy, FileSpreadsheet, Table2 } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { ResultCell, SearchResult } from '@shared/types'
import { useApp } from '../shared/AppProvider'
import { dur, fade, shake, shakeTransition, spring } from '../motion/tokens'
import s from './results.module.css'

const MAX_CHIPS = 8
const PILL_MS = 1100

/** Cell text with <mark> highlights. `hlKey` re-runs the wipe animation for a new query. */
export function Highlighted({ cell, hlKey }: { cell: ResultCell; hlKey: string }): ReactNode {
  if (cell.highlights.length === 0) return <bdi>{cell.value}</bdi>
  const parts: ReactNode[] = []
  let pos = 0
  cell.highlights.forEach((h, i) => {
    if (h.start > pos) parts.push(cell.value.slice(pos, h.start))
    parts.push(<mark key={`${hlKey}-${i}`}>{cell.value.slice(h.start, h.end)}</mark>)
    pos = h.end
  })
  if (pos < cell.value.length) parts.push(cell.value.slice(pos))
  return <bdi>{parts}</bdi>
}

interface Pill {
  id: number
  x: number
  y: number
  label: string
  error?: boolean
}

export interface CardProps {
  result: SearchResult
  selected: boolean
  hlKey: string
  /** Stagger index on first reveal; null = no stagger (updates, reduced motion). */
  stagger: number | null
  copyHeaders: boolean
  onSelect: (rowId: number) => void
  onCopied: () => void
  /** Imperative copy trigger from the keyboard (Enter / Ctrl+C). */
  copySignal: number
  openSignal: number
}

function ResultCardImpl({ result, selected, hlKey, stagger, copyHeaders, onSelect, onCopied, copySignal, openSignal }: CardProps): ReactNode {
  const { t, reduceMotion } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [pills, setPills] = useState<Pill[]>([])
  const [flash, setFlash] = useState<number | null>(null)
  const [body, animateBody] = useAnimate<HTMLDivElement>()
  const pillId = useRef(0)

  const showPill = useCallback((x: number, y: number, label: string, error = false) => {
    const id = ++pillId.current
    // keep the pill inside the card (it floats up from the click point)
    const width = ref.current?.offsetWidth ?? 300
    const px = Math.min(Math.max(x, 70), width - 70)
    setPills((p) => [...p.slice(-2), { id, x: px, y: Math.max(y, 46), label, error }])
    setTimeout(() => setPills((p) => p.filter((q) => q.id !== id)), PILL_MS)
  }, [])

  const centre = (): { x: number; y: number } => {
    const r = ref.current?.getBoundingClientRect()
    return { x: (r?.width ?? 200) / 2, y: 28 }
  }

  const copyRow = useCallback(
    async (withHeaders: boolean, at?: { x: number; y: number }) => {
      const cells = result.cells.map((c) => ({ header: c.header, value: c.value }))
      const key = `${result.filePath}\u0000${result.sheetName}\u0000${result.rowNum}`
      if (!reduceMotion && body.current) void animateBody(body.current, { scale: [0.98, 1] }, spring.snappy)
      await window.ff.invoke('copy:row', { cells, withHeaders, key })
      const p = at ?? centre()
      showPill(p.x, p.y, t('bar.copied'))
      onCopied()
    },
    [result, showPill, t, onCopied, reduceMotion, animateBody, body]
  )

  const openExcel = useCallback(async () => {
    const p = centre()
    showPill(p.x, p.y, t('bar.opening'))
    const res = await window.ff.invoke('excel:open', { filePath: result.filePath, sheet: result.sheetName, row: result.rowNum })
    if (res === 'failed') {
      showPill(p.x, p.y, t('bar.openFailed'), true)
      if (!reduceMotion && body.current) void animateBody(body.current, shake, shakeTransition)
    }
  }, [result, showPill, t, reduceMotion, animateBody, body])

  // keyboard-triggered actions from the bar
  const lastCopy = useRef(copySignal)
  const lastOpen = useRef(openSignal)
  useEffect(() => {
    if (selected && copySignal !== lastCopy.current) void copyRow(copyHeaders)
    lastCopy.current = copySignal
  }, [copySignal, selected, copyRow, copyHeaders])
  useEffect(() => {
    if (selected && openSignal !== lastOpen.current) void openExcel()
    lastOpen.current = openSignal
  }, [openSignal, selected, openExcel])

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const localPoint = (e: MouseEvent): { x: number; y: number } => {
    const r = ref.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onCardClick = (e: MouseEvent): void => {
    // Let people select text inside a card for a manual copy.
    if (window.getSelection()?.toString()) return
    onSelect(result.rowId)
    void copyRow(copyHeaders, localPoint(e))
  }

  const onChip = async (e: MouseEvent, cell: ResultCell): Promise<void> => {
    e.stopPropagation()
    if (window.getSelection()?.toString()) return
    onSelect(result.rowId)
    const at = localPoint(e)
    await window.ff.invoke('copy:text', cell.value)
    setFlash(cell.col)
    setTimeout(() => setFlash((f) => (f === cell.col ? null : f)), 450)
    showPill(at.x, at.y, t('bar.copied'))
    onCopied()
  }

  const details = expanded ? result.details : result.details.slice(0, MAX_CHIPS)
  const hidden = result.details.length - details.length
  const delay = stagger !== null && !reduceMotion ? Math.min(stagger, 10) * 0.025 : 0

  return (
    <motion.div
      ref={ref}
      layout={reduceMotion ? false : 'position'}
      id={`ff-r-${result.rowId}`}
      role="option"
      aria-selected={selected}
      data-selected={selected}
      className={s.card}
      onClick={onCardClick}
      initial={stagger !== null ? { opacity: 0, y: reduceMotion ? 0 : 8 } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98, transition: { duration: dur.sm } }}
      transition={
        reduceMotion
          ? fade
          : { ...spring.smooth, delay, opacity: { duration: dur.sm, delay }, layout: spring.smooth }
      }
    >
      <div ref={body} className={s.cardBody}>
      <div className={s.titleRow}>
        <span className={s.title}>
          <Highlighted cell={result.title} hlKey={hlKey} />
        </span>
        {result.similar && <span className={s.badge}>{t('bar.similar')}</span>}
        {result.offline && <span className={`${s.badge} ${s.badgeOffline}`}>{t('bar.offlineBadge')}</span>}
      </div>

      {result.details.length > 0 && (
        <div className={s.chips}>
          {details.map((cell) => (
            <button
              key={cell.col}
              type="button"
              className={s.chip}
              data-flash={flash === cell.col}
              onClick={(e) => void onChip(e, cell)}
              tabIndex={selected ? 0 : -1}
            >
              {cell.header && <span className={s.chipHeader}>{cell.header}:</span>}
              <span className={s.chipValue}>
                <Highlighted cell={cell} hlKey={hlKey} />
              </span>
            </button>
          ))}
          {(hidden > 0 || expanded) && result.details.length > MAX_CHIPS && (
            <button
              type="button"
              className={`${s.chip} ${s.moreChip}`}
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((x) => !x)
              }}
              tabIndex={selected ? 0 : -1}
            >
              {expanded ? t('bar.less') : t('bar.more', { count: hidden })}
            </button>
          )}
        </div>
      )}

      <div className={s.sourceRow}>
        <span className={s.sourcePath} title={result.filePath}>
          <bdi dir="ltr">{result.fileName}</bdi>
          <span className={s.sep} aria-hidden>
            ›
          </span>
          <bdi>{result.sheetName}</bdi>
          <span className={s.sep} aria-hidden>
            ›
          </span>
          <span className="num">{t('bar.row', { row: result.rowNum })}</span>
        </span>
        <span className={s.actions}>
          <button
            type="button"
            className={s.action}
            title={t('bar.copyRow')}
            onClick={(e) => {
              e.stopPropagation()
              void copyRow(false, localPoint(e))
            }}
            tabIndex={selected ? 0 : -1}
          >
            <Copy size={15} strokeWidth={1.75} aria-hidden />
            {t('bar.copyRow')}
          </button>
          <button
            type="button"
            className={s.action}
            title={t('bar.copyWithHeaders')}
            aria-label={t('bar.copyWithHeaders')}
            onClick={(e) => {
              e.stopPropagation()
              void copyRow(true, localPoint(e))
            }}
            tabIndex={selected ? 0 : -1}
          >
            <Table2 size={15} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            className={s.action}
            title={t('bar.openExcel')}
            aria-label={t('bar.openExcel')}
            onClick={(e) => {
              e.stopPropagation()
              void openExcel()
            }}
            tabIndex={selected ? 0 : -1}
          >
            <FileSpreadsheet size={15} strokeWidth={1.75} aria-hidden />
          </button>
        </span>
      </div>
      </div>

      <AnimatePresence>
        {pills.map((p) => (
          <motion.span
            key={p.id}
            className={`${s.copied} ${p.error ? s.copiedError : ''}`}
            style={{ left: p.x, top: p.y }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: -6 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, transition: { duration: dur.sm } }}
            transition={reduceMotion ? fade : spring.snappy}
            role="status"
          >
            {!p.error && (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <motion.path
                  d="M3.5 8.5l3 3 6-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: reduceMotion ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.24, delay: 0.06, ease: [0.23, 1, 0.32, 1] }}
                />
              </svg>
            )}
            {p.label}
          </motion.span>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}

export const ResultCard = memo(ResultCardImpl)
