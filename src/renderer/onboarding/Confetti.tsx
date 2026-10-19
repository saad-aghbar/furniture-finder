import { useEffect, useRef, type ReactNode } from 'react'

const COLORS = ['#8A5A2B', '#B07A43', '#D2A06A', '#6F4620', '#E8C79A', '#5E3B1A']
const COUNT = 24
const DURATION = 900

/** A short burst of wood-tone confetti (≤ 24 particles, 900 ms). Caller skips it for reduced motion. */
export function Confetti(): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    const cx = width / 2
    const cy = height * 0.36
    const parts = Array.from({ length: COUNT }, (_, i) => {
      const angle = (i / COUNT) * Math.PI * 2 + Math.random() * 0.3
      const speed = 3.2 + Math.random() * 3.2
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 5,
        h: 3 + Math.random() * 3,
        color: COLORS[i % COLORS.length]!
      }
    })
    const start = performance.now()
    let raf = 0
    const frame = (now: number): void => {
      const t = (now - start) / DURATION
      ctx.clearRect(0, 0, width, height)
      if (t >= 1) return
      for (const p of parts) {
        p.vy += 0.16
        p.vx *= 0.985
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        ctx.save()
        ctx.globalAlpha = 1 - t * t
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
}
