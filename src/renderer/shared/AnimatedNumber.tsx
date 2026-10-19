import { useMotionValueEvent, useSpring } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from './AppProvider'

/** A number that counts up smoothly (spring); instant with reduced motion. */
export function AnimatedNumber({ value }: { value: number }): ReactNode {
  const { reduceMotion, lang } = useApp()
  const mv = useSpring(value, { stiffness: 120, damping: 24 })
  const [shown, setShown] = useState(value)
  useEffect(() => {
    if (reduceMotion) {
      mv.jump(value)
      setShown(value)
    } else mv.set(value)
  }, [value, reduceMotion, mv])
  useMotionValueEvent(mv, 'change', (v) => setShown(Math.round(v)))
  const fmt = new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : lang)
  return <span className="num">{fmt.format(shown)}</span>
}
