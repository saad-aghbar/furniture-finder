import { AnimatePresence, motion, useAnimate, useSpring, type Variants } from 'motion/react'
import { ChevronDown, Download, Ellipsis, LoaderCircle, Search, X } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { hotkeyLabel } from '@shared/i18n'
import type { BarLayout, BarState } from '@shared/ipc'
import { scopeLabel } from '@shared/scope'
import type { IndexProgress, ScopeTreeSource, SnapPosition, SourceInfo } from '@shared/types'
import { useApp, useFFEvent } from '../shared/AppProvider'
import { dur, ease, fade, spring } from '../motion/tokens'
import { OverflowMenu } from './OverflowMenu'
import { Results, groupResults, type PanelMode } from './Results'
import { ScopeMenu } from './ScopePicker'
import { useSearch } from './useSearch'
import s from './bar.module.css'

const GAP = 8
const EMPTY_PROGRESS: IndexProgress = { running: false, filesTotal: 0, filesDone: 0, rowsIndexed: 0, currentFile: null, errors: [] }
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

type Menu = 'scope' | 'more' | null
interface Toast {
  id: number
  text: string
}

export default function BarApp(): ReactNode {
  const { settings, update, t, dir, reduceMotion } = useApp()
  const [layout, setLayout] = useState<BarLayout | null>(null)
  const [barState, setBarState] = useState<BarState>({ moveMode: false, dragging: false, vx: 0 })
  const [visible, setVisible] = useState(false)
  const [everShown, setEverShown] = useState(false)
  const [launchKey, setLaunchKey] = useState(0)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [menu, setMenu] = useState<Menu>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [progress, setProgress] = useState<IndexProgress>(EMPTY_PROGRESS)
  const [sources, setSources] = useState<SourceInfo[] | null>(null)
  const [tree, setTree] = useState<ScopeTreeSource[]>([])
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [openKey, setOpenKey] = useState(0)
  const [copySignal, setCopySignal] = useState(0)
  const [openSignal, setOpenSignal] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const toastId = useRef(0)
  const search = useSearch(settings.resultsPerPage)
  const { query, setQuery, response } = search
  const rotate = useSpring(0, spring.smooth)
  const [iconScope, animateIcon] = useAnimate<HTMLSpanElement>()

  // ---------- data from main ----------
  useEffect(() => {
    void window.ff.invoke('bar:layout').then(setLayout)
    void window.ff.invoke('index:progress').then(setProgress)
    void window.ff.invoke('sources:list').then(setSources)
    void window.ff.invoke('scope:tree').then(setTree)
    const fallback = setTimeout(() => setVisible(true), 400)
    return () => clearTimeout(fallback)
  }, [])

  useFFEvent('bar:layout', setLayout)
  useFFEvent('index:progress', setProgress)
  useFFEvent('sources:changed', setSources)
  useFFEvent(
    'index:changed',
    useCallback(() => {
      search.rerun()
      void window.ff.invoke('scope:tree').then(setTree)
    }, [search])
  )
  useFFEvent(
    'bar:state',
    useCallback(
      (st: BarState) => {
        setBarState(st)
        if (!reduceMotion) rotate.set(st.dragging ? clamp(st.vx * 0.35, -2, 2) : 0)
      },
      [reduceMotion, rotate]
    )
  )
  useFFEvent(
    'bar:did-show',
    useCallback(() => {
      setVisible(true)
      setLaunchKey((k) => k + 1)
    }, [])
  )
  useFFEvent(
    'bar:will-hide',
    useCallback(() => {
      setVisible(false)
      setMenu(null)
    }, [])
  )
  useFFEvent(
    'bar:focus',
    useCallback(() => {
      setVisible(true)
      inputRef.current?.focus()
      inputRef.current?.select()
    }, [])
  )
  useFFEvent(
    'update:ready',
    useCallback((u: { version: string }) => setUpdateVersion(u.version), [])
  )

  useEffect(() => {
    if (visible) setEverShown(true)
  }, [visible])

  // Re-run the search when the scope changes.
  const scopeKey = JSON.stringify(settings.scope)
  useEffect(() => {
    search.rerun()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])

  // ---------- click-through: tell main when the pointer is over something solid ----------
  useEffect(() => {
    let last = false
    const set = (v: boolean): void => {
      if (v === last) return
      last = v
      setHovered(v)
      void window.ff.invoke('bar:hover', v)
    }
    const onMove = (e: MouseEvent): void => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      set(!!el?.closest('[data-hit]'))
    }
    const onLeave = (): void => set(false)
    window.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // Close menus when clicking elsewhere or when another app takes focus.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: globalThis.PointerEvent): void => {
      const el = e.target as HTMLElement
      if (!el.closest('[data-menu]') && !el.closest('[data-menu-trigger]')) setMenu(null)
    }
    const onBlur = (): void => setMenu(null)
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setMenu(null)
      inputRef.current?.focus()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('blur', onBlur)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menu])

  // Icon pulse each time a query is sent.
  useEffect(() => {
    if (search.pulse === 0 || reduceMotion || !iconScope.current) return
    void animateIcon(iconScope.current, { scale: [1, 1.08, 1] }, { duration: 0.22, ease: ease.out })
  }, [search.pulse, reduceMotion, animateIcon, iconScope])

  const showToast = useCallback((text: string, ms = 3200) => {
    const id = ++toastId.current
    setToast({ id, text })
    if (ms > 0) setTimeout(() => setToast((x) => (x?.id === id ? null : x)), ms)
  }, [])

  // ---------- results / panel ----------
  const flat = useMemo(() => groupResults(response?.results ?? []).flat, [response])
  useEffect(() => {
    setDismissed(false)
    setSelectedId(null)
  }, [query])
  useEffect(() => {
    if (selectedId !== null && !flat.some((r) => r.rowId === selectedId)) setSelectedId(null)
  }, [flat, selectedId])

  const hasSources = sources === null ? true : sources.length > 0
  const recentOn = settings.recentSearchesOn && settings.recentSearches.length > 0
  let mode: PanelMode = null
  if (!barState.moveMode && visible) {
    if (!hasSources && (focused || query)) mode = 'noFiles'
    else if (query.trim() && !dismissed) mode = 'results'
    else if (!query && focused && recentOn && !dismissed) mode = 'recent'
  }
  const prevMode = useRef<PanelMode>(null)
  useEffect(() => {
    if (mode && !prevMode.current) setOpenKey((k) => k + 1)
    prevMode.current = mode
  }, [mode])

  const label = useMemo(
    () => scopeLabel(settings.scope, tree, { all: t('bar.scopeAll'), count: (n) => t('bar.scopeCount', { count: n }) }),
    [settings.scope, tree, t]
  )

  // ---------- keyboard ----------
  const move = (delta: number): void => {
    if (flat.length === 0) return
    const i = flat.findIndex((r) => r.rowId === selectedId)
    const next = i < 0 ? (delta > 0 ? 0 : flat.length - 1) : clamp(i + delta, 0, flat.length - 1)
    setSelectedId(flat[next]!.rowId)
  }

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (query.trim()) void window.ff.invoke('recent:add', query.trim())
      if (e.ctrlKey || e.metaKey) {
        if (selectedId !== null) setOpenSignal((x) => x + 1)
      } else if (selectedId === null) {
        if (flat[0]) setSelectedId(flat[0].rowId)
      } else setCopySignal((x) => x + 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (menu) setMenu(null)
      else if (query) setQuery('')
      else if (mode) setDismissed(true)
      else inputRef.current?.blur()
    } else if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey)) {
      const el = e.currentTarget
      if (el.selectionStart === el.selectionEnd && selectedId !== null) {
        e.preventDefault()
        setCopySignal((x) => x + 1)
      }
    }
  }

  // Move mode keys: Enter places, Esc cancels.
  useEffect(() => {
    if (!barState.moveMode) return
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Enter') void window.ff.invoke('bar:move-mode', false)
      if (e.key === 'Escape') void window.ff.invoke('bar:move-cancel')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [barState.moveMode])

  useEffect(() => {
    if (barState.moveMode) showToast(t('bar.moveHint'), 0)
    else setToast((x) => (x?.text === t('bar.moveHint') ? null : x))
  }, [barState.moveMode, showToast, t])

  // ---------- dragging & resizing (main moves the window from the cursor position) ----------
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const beginDrag = (e: PointerEvent<HTMLElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = { x: e.screenX, y: e.screenY }
    setMenu(null)
    void window.ff.invoke('bar:drag-start')
  }
  const endDrag = (e: PointerEvent<HTMLElement>): void => {
    if (!dragStart.current) return
    const moved = Math.hypot(e.screenX - dragStart.current.x, e.screenY - dragStart.current.y)
    dragStart.current = null
    void window.ff.invoke('bar:drag-end', { cancel: false })
    // In move mode a click (no drag) places the bar.
    if (barState.moveMode && moved < 4) void window.ff.invoke('bar:move-mode', false)
  }
  // Press and hold ⋯ (or start dragging it) to pick the bar up; a quick click opens the menu.
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; dragging: boolean; id: number; el: HTMLElement } | null>(null)
  const suppressMenuClick = useRef(false)
  const startHoldDrag = (): void => {
    const h = hold.current
    if (!h || h.dragging) return
    clearTimeout(h.timer)
    h.dragging = true
    suppressMenuClick.current = true
    h.el.setPointerCapture(h.id)
    dragStart.current = { x: h.x, y: h.y }
    setMenu(null)
    void window.ff.invoke('bar:drag-start')
  }
  const onMorePointerDown = (e: PointerEvent<HTMLButtonElement>): void => {
    if (e.button !== 0 || barState.moveMode) return
    suppressMenuClick.current = false
    const el = e.currentTarget
    hold.current = { timer: setTimeout(startHoldDrag, 350), x: e.screenX, y: e.screenY, dragging: false, id: e.pointerId, el }
  }
  const onMorePointerMove = (e: PointerEvent<HTMLButtonElement>): void => {
    const h = hold.current
    if (h && !h.dragging && Math.hypot(e.screenX - h.x, e.screenY - h.y) > 6) startHoldDrag()
  }
  const onMorePointerUp = (e: PointerEvent<HTMLButtonElement>): void => {
    const h = hold.current
    hold.current = null
    if (!h) return
    clearTimeout(h.timer)
    if (h.dragging) {
      e.stopPropagation()
      dragStart.current = null
      void window.ff.invoke('bar:drag-end', { cancel: false })
    }
  }
  // If the button release never reaches us (focus change, window moved away from the pointer),
  // end the drag as soon as we see the pointer move with no button pressed.
  useEffect(() => {
    const finish = (): void => {
      const h = hold.current
      if (h) clearTimeout(h.timer)
      hold.current = null
      if (!dragStart.current) return
      dragStart.current = null
      void window.ff.invoke('bar:drag-end', { cancel: false })
    }
    const onMove = (e: globalThis.PointerEvent): void => {
      if (dragStart.current && e.buttons === 0) finish()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('blur', finish)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('blur', finish)
    }
  }, [])

  const onBarPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement
    const onEmpty = target === e.currentTarget || target.dataset['dragZone'] === 'true'
    if (barState.moveMode || onEmpty) beginDrag(e)
  }
  const beginResize = (edge: 'left' | 'right') => (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    void window.ff.invoke('bar:resize-start', edge)
  }
  const endResize = (): void => void window.ff.invoke('bar:resize-end')

  // ---------- menu actions ----------
  const act = {
    move: () => {
      setMenu(null)
      setDismissed(true)
      void window.ff.invoke('bar:move-mode', true)
    },
    snap: (p: SnapPosition) => {
      setMenu(null)
      void window.ff.invoke('bar:snap', p)
    },
    manage: () => {
      setMenu(null)
      void window.ff.invoke('app:open-window', 'sources')
    },
    reindex: () => {
      setMenu(null)
      void window.ff.invoke('index:reindex', { force: true })
    },
    settings: () => {
      setMenu(null)
      void window.ff.invoke('app:open-window', 'settings')
    },
    hide: () => {
      setMenu(null)
      setDismissed(true)
      showToast(t('bar.hideNote', { hotkey: hotkeyLabel(settings.hotkey, window.ff.platform) }), 2600)
      setTimeout(() => void window.ff.invoke('bar:hide'), 2400)
    },
    quit: () => void window.ff.invoke('app:quit')
  }

  if (!layout) return null

  const { openUp, barWidth, barHeight, panelMax, margin } = layout
  const barTop = openUp ? margin + panelMax + GAP : margin
  const active = hovered || focused || mode !== null || menu !== null || barState.moveMode
  const opacity = active ? 1 : settings.idleOpacity / 100
  const growScale = 1 + 16 / barWidth
  const readingShift = dir === 'rtl' ? -4 : 4
  const menuPos = openUp ? { bottom: barHeight + GAP } : { top: barHeight + GAP }
  const originY = openUp ? 'bottom' : 'top'
  const menuMax = Math.max(220, panelMax - 4)
  const pending = progress.running ? Math.max(0, progress.filesTotal - progress.filesDone) : 0
  const progressValue = progress.filesTotal > 0 ? progress.filesDone / progress.filesTotal : null

  const variants: Variants = reduceMotion
    ? { hidden: { opacity: 0 }, shown: { opacity: 1, transition: fade }, hiding: { opacity: 0, transition: fade } }
    : {
        hidden: { opacity: 0, scale: 0.92, y: -12, filter: 'blur(8px)' },
        shown: { opacity: 1, scale: barState.moveMode ? 1.02 : 1, y: 0, filter: 'blur(0px)', transition: spring.gentle },
        hiding: { opacity: 0, scale: 0.96, y: -8, filter: 'blur(0px)', transition: { duration: dur.sm, ease: ease.out } }
      }

  const menuMotion = (originX: string, position: React.CSSProperties) =>
    reduceMotion
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade, style: position }
      : {
          initial: { opacity: 0, scale: 0.96, y: openUp ? 4 : -4 },
          animate: { opacity: 1, scale: 1, y: 0 },
          exit: { opacity: 0, scale: 0.96, transition: { duration: dur.xs } },
          transition: spring.snappy,
          style: { ...position, transformOrigin: `${originX} ${originY}` }
        }
  const endSide = dir === 'rtl' ? 'left' : 'right'

  return (
    <div className={`${s.stage} ${barState.moveMode ? s.moving : ''}`}>
      <div className={s.barSlot} style={{ left: margin, top: barTop, width: barWidth, height: barHeight }}>
        <div style={{ height: '100%', opacity, transition: 'opacity 220ms cubic-bezier(0.23, 1, 0.32, 1)' }}>
          <motion.div
            className={`${s.bar} ${focused ? s.focused : ''} ${barState.moveMode || barState.dragging ? s.lifted : ''}`}
            data-hit
            variants={variants}
            initial="hidden"
            animate={visible ? 'shown' : everShown ? 'hiding' : 'hidden'}
            style={{ rotate }}
            onPointerDownCapture={barState.moveMode ? onBarPointerDown : undefined}
            onPointerDown={barState.moveMode ? undefined : onBarPointerDown}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <motion.div
              className={s.barBg}
              data-drag-zone="true"
              animate={{ scaleX: focused && !reduceMotion ? growScale : 1 }}
              transition={spring.smooth}
            />
            {barState.moveMode && (
              <svg className={s.moveOutline} aria-hidden>
                <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx={barHeight / 2 + 5} />
              </svg>
            )}
            <div className={s.barInner} data-drag-zone="true">
              <button
                type="button"
                className={s.iconButton}
                aria-label={t('bar.dragHandle')}
                title={t('bar.dragHandle')}
                onPointerDown={barState.moveMode ? undefined : beginDrag}
                onClick={() => inputRef.current?.focus()}
                tabIndex={-1}
              >
                <motion.span
                  key={launchKey}
                  ref={iconScope}
                  style={{ display: 'grid' }}
                  initial={reduceMotion ? false : { rotate: -20 }}
                  animate={{ rotate: 0 }}
                  transition={{ ...spring.gentle, delay: 0.06 }}
                >
                  {search.searching ? (
                    <LoaderCircle size={24} strokeWidth={2} className={reduceMotion ? undefined : 'spin'} aria-hidden />
                  ) : (
                    <Search size={24} strokeWidth={2} aria-hidden />
                  )}
                </motion.span>
              </button>

              <div className={s.inputWrap} data-drag-zone="true">
                <input
                  ref={inputRef}
                  className={s.input}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKey}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  dir="auto"
                  spellCheck={false}
                  autoComplete="off"
                  role="combobox"
                  aria-label={t('bar.searchLabel')}
                  aria-expanded={mode === 'results'}
                  aria-controls="ff-results"
                  aria-autocomplete="list"
                  aria-activedescendant={selectedId !== null ? `ff-r-${selectedId}` : undefined}
                  readOnly={barState.moveMode}
                />
                {!query && (
                  <motion.span
                    className={s.placeholder}
                    aria-hidden
                    animate={{ x: focused && !reduceMotion ? readingShift : 0, opacity: focused ? 0.55 : 1 }}
                    transition={{ duration: dur.sm, ease: ease.out }}
                  >
                    {t('bar.placeholder')}
                  </motion.span>
                )}
              </div>

              <AnimatePresence>
                {query && (
                  <motion.button
                    type="button"
                    className={s.clearButton}
                    onClick={() => {
                      setQuery('')
                      inputRef.current?.focus()
                    }}
                    aria-label={t('bar.clear')}
                    title={t('bar.clear')}
                    initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.8 }}
                    transition={{ duration: dur.xs }}
                  >
                    <X size={18} strokeWidth={2} />
                  </motion.button>
                )}
              </AnimatePresence>

              <button
                type="button"
                className={s.scopeButton}
                aria-haspopup="dialog"
                aria-expanded={menu === 'scope'}
                data-menu-trigger
                onClick={() => {
                  if (menu !== 'scope') void window.ff.invoke('scope:tree').then(setTree)
                  setMenu((m) => (m === 'scope' ? null : 'scope'))
                }}
                title={label}
              >
                <span className={s.scopeLabel}>
                  <bdi>{label}</bdi>
                </span>
                <ChevronDown size={18} strokeWidth={2} className={s.chevron} aria-hidden />
                <AnimatePresence>
                  {settings.scope.length > 0 && (
                    <motion.span
                      className={s.scopeDot}
                      initial={{ scale: reduceMotion ? 1 : 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: reduceMotion ? 1 : 0.4, opacity: 0 }}
                      transition={reduceMotion ? fade : spring.snappy}
                    />
                  )}
                </AnimatePresence>
              </button>

              <button
                type="button"
                className={s.moreButton}
                aria-haspopup="menu"
                aria-expanded={menu === 'more'}
                aria-label={t('bar.menu')}
                title={t('bar.menuHint')}
                data-menu-trigger
                onPointerDown={onMorePointerDown}
                onPointerMove={onMorePointerMove}
                onPointerUp={onMorePointerUp}
                onPointerCancel={onMorePointerUp}
                onClick={() => {
                  if (suppressMenuClick.current) {
                    suppressMenuClick.current = false
                    return
                  }
                  setMenu((m) => (m === 'more' ? null : 'more'))
                }}
                style={{ touchAction: 'none' }}
              >
                <Ellipsis size={22} strokeWidth={2} />
              </button>
            </div>

            <div className={`${s.edge} ${s.edgeLeft}`} onPointerDown={beginResize('left')} onPointerUp={endResize} onPointerCancel={endResize} title={t('bar.resizeHandle')} />
            <div className={`${s.edge} ${s.edgeRight}`} onPointerDown={beginResize('right')} onPointerUp={endResize} onPointerCancel={endResize} title={t('bar.resizeHandle')} />

            <AnimatePresence>
              {progress.running && (
                <motion.div className={s.progress} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.sm }} aria-hidden>
                  {progressValue === null ? (
                    <div className={s.progressShimmer} />
                  ) : (
                    <motion.div className={s.progressFill} initial={{ scaleX: 0 }} animate={{ scaleX: Math.max(0.04, progressValue) }} transition={spring.smooth} />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {updateVersion && (
                <motion.button
                  type="button"
                  className={s.updatePill}
                  onClick={() => void window.ff.invoke('app:install-update')}
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduceMotion ? fade : spring.snappy}
                >
                  <Download size={14} strokeWidth={2.2} aria-hidden />
                  {t('bar.updateReady')}
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        <AnimatePresence>
          {menu === 'scope' && (
            <motion.div key="scope" className={s.menu} data-hit data-menu {...menuMotion(endSide === 'right' ? 'calc(100% - 80px)' : '80px', { ...menuPos, width: Math.min(400, barWidth) })}>
              <ScopeMenu tree={tree} scope={settings.scope} onChange={(scope) => void update({ scope })} maxHeight={menuMax - 12} />
            </motion.div>
          )}
          {menu === 'more' && (
            <motion.div key="more" className={s.menu} data-hit data-menu {...menuMotion(endSide === 'right' ? 'calc(100% - 22px)' : '22px', menuPos)}>
              <OverflowMenu
                onMove={act.move}
                onSnap={act.snap}
                onManage={act.manage}
                onReindex={act.reindex}
                onSettings={act.settings}
                onHide={act.hide}
                onQuit={act.quit}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && !menu && (
            <motion.div
              key={toast.id}
              className={s.toast}
              style={openUp ? { bottom: barHeight + 12 } : { top: barHeight + 12 }}
              initial={{ opacity: 0, y: reduceMotion ? 0 : openUp ? -6 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: dur.sm } }}
              transition={reduceMotion ? fade : spring.snappy}
              role="status"
            >
              <div className={s.toastInner}>{toast.text}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Results
        mode={menu === 'scope' ? null : mode}
        openUp={openUp}
        style={{ left: margin, width: barWidth, ...(openUp ? { bottom: margin + barHeight + GAP } : { top: margin + barHeight + GAP }) }}
        maxHeight={panelMax}
        response={response}
        query={query}
        selectedId={selectedId}
        onSelect={setSelectedId}
        progress={progress}
        scopeLabel={settings.scope.length > 0 ? label : null}
        onSearchAll={() => void update({ scope: [] })}
        onClose={() => setDismissed(true)}
        onShowMore={search.showMore}
        canShowMore={!!response && response.results.length >= search.limit && response.total > response.results.length}
        onAddFiles={act.manage}
        recent={settings.recentSearches}
        onPickRecent={(q) => {
          setQuery(q)
          inputRef.current?.focus()
        }}
        onClearRecent={() => void window.ff.invoke('recent:clear')}
        copySignal={copySignal}
        openSignal={openSignal}
        onCopied={() => {
          if (query.trim()) void window.ff.invoke('recent:add', query.trim())
        }}
        openKey={openKey}
      />
      {pending > 0 && !mode && <span className="sr-only" role="status">{t('bar.stillReading', { count: pending })}</span>}
    </div>
  )
}
