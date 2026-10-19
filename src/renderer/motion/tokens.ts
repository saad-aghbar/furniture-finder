import type { Transition } from 'motion/react'

/** Shared springs and timings – docs/DESIGN.md "Motion spec". */
export const spring = {
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },
  smooth: { type: 'spring', stiffness: 300, damping: 32 },
  gentle: { type: 'spring', stiffness: 180, damping: 26 }
} satisfies Record<string, Transition>

export const ease = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number]
}

export const dur = { xs: 0.12, sm: 0.18, md: 0.28, lg: 0.45 }

/** Reduced-motion replacement: a short opacity fade, no movement. */
export const fade: Transition = { duration: dur.xs, ease: 'easeOut' }

/** Shake for errors: once, never loops. */
export const shake = { x: [0, -6, 6, -3, 3, 0] }
export const shakeTransition: Transition = { duration: 0.32, ease: ease.out }
