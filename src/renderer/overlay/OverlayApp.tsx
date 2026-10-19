import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useState, type ReactNode } from 'react'
import type { OverlayState } from '@shared/ipc'
import { useApp, useFFEvent } from '../shared/AppProvider'
import { fade, spring } from '../motion/tokens'

/** Ghost pills showing where the bar can snap while it is being moved. */
export default function OverlayApp(): ReactNode {
  const { t, reduceMotion } = useApp()
  const [state, setState] = useState<OverlayState>({ targets: [], active: null })
  useFFEvent('overlay:state', useCallback((s: OverlayState) => setState(s), []))

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      <AnimatePresence>
        {state.targets.map((tg) => {
          const active = state.active === tg.id
          return (
            <motion.div
              key={tg.id}
              initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
              animate={{ opacity: active ? 1 : 0.7, scale: active && !reduceMotion ? 1.03 : 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? fade : spring.snappy}
              style={{
                position: 'absolute',
                left: tg.x,
                top: tg.y,
                width: tg.width,
                height: tg.height,
                borderRadius: tg.height / 2,
                border: `2px dashed ${active ? 'var(--accent)' : 'var(--border-strong)'}`,
                background: active ? 'var(--accent-soft)' : 'color-mix(in srgb, var(--surface) 35%, transparent)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--text-muted)',
                fontSize: 'var(--fs-small)',
                fontWeight: 600
              }}
            >
              {t(`bar.snap.${tg.id}`)}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
