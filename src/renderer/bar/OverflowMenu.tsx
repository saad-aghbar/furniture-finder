import { motion } from 'motion/react'
import { EyeOff, FolderOpen, Move, Power, RefreshCw, Settings } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { SnapPosition } from '@shared/types'
import type { MessageKey } from '@shared/i18n'
import { useApp } from '../shared/AppProvider'
import { fade, spring } from '../motion/tokens'
import s from './bar.module.css'

const SNAPS: SnapPosition[] = ['top-left', 'top-center', 'top-right', 'bottom-center']

interface Props {
  onMove: () => void
  onSnap: (p: SnapPosition) => void
  onManage: () => void
  onReindex: () => void
  onSettings: () => void
  onHide: () => void
  onQuit: () => void
}

/** The ⋯ menu. Items stagger in 20 ms apart; arrow keys + first-letter typeahead. */
export function OverflowMenu(p: Props): ReactNode {
  const { t, reduceMotion } = useApp()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [])

  const items: { key: MessageKey; icon: ReactNode; run: () => void; danger?: boolean }[] = [
    { key: 'bar.moveBar', icon: <Move size={20} strokeWidth={1.75} />, run: p.onMove },
    { key: 'bar.manageFiles', icon: <FolderOpen size={20} strokeWidth={1.75} />, run: p.onManage },
    { key: 'bar.reindex', icon: <RefreshCw size={20} strokeWidth={1.75} />, run: p.onReindex },
    { key: 'bar.settings', icon: <Settings size={20} strokeWidth={1.75} />, run: p.onSettings },
    { key: 'bar.hide', icon: <EyeOff size={20} strokeWidth={1.75} />, run: p.onHide },
    { key: 'bar.quit', icon: <Power size={20} strokeWidth={1.75} />, run: p.onQuit, danger: true }
  ]

  const onKeyDown = (e: KeyboardEvent): void => {
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const i = nodes.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      nodes[(i + 1) % nodes.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      nodes[(i - 1 + nodes.length) % nodes.length]?.focus()
    } else if (e.key === 'Home') nodes[0]?.focus()
    else if (e.key === 'End') nodes[nodes.length - 1]?.focus()
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const ch = e.key.toLocaleLowerCase()
      const start = i + 1
      for (let k = 0; k < nodes.length; k++) {
        const n = nodes[(start + k) % nodes.length]!
        if ((n.textContent ?? '').trim().toLocaleLowerCase().startsWith(ch)) {
          n.focus()
          break
        }
      }
    }
  }

  let order = 0
  const item = (motionProps: { key: string; children: ReactNode; className: string | undefined; onClick: () => void; label?: string }): ReactNode => {
    const i = order++
    return (
      <motion.button
        key={motionProps.key}
        type="button"
        role="menuitem"
        className={motionProps.className}
        onClick={motionProps.onClick}
        aria-label={motionProps.label}
        title={motionProps.label}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? fade : { ...spring.snappy, delay: i * 0.02 }}
      >
        {motionProps.children}
      </motion.button>
    )
  }

  return (
    <div ref={ref} role="menu" aria-label={t('bar.menu')} onKeyDown={onKeyDown} style={{ width: 290 }}>
      {item({ key: 'move', className: s.menuItem, onClick: p.onMove, children: (
          <>
            {items[0]!.icon}
            <span>{t('bar.moveBar')}</span>
          </>
        ) })}
      <div className={s.menuLabel}>{t('bar.snapTitle')}</div>
      <div className={s.snapRow}>
        {SNAPS.map((pos) =>
          item({
            key: pos,
            className: s.snapButton,
            onClick: () => p.onSnap(pos),
            label: t(`bar.snap.${pos}` as MessageKey),
            children: <span className={s.snapGlyph} data-pos={pos} aria-hidden />
          })
        )}
      </div>
      <div className={s.menuSep} />
      {items.slice(1).map((it) =>
        item({
          key: it.key,
          className: `${s.menuItem} ${it.danger ? s.menuDanger : ''}`,
          onClick: it.run,
          children: (
            <>
              {it.icon}
              <span>{t(it.key)}</span>
            </>
          )
        })
      )}
    </div>
  )
}
