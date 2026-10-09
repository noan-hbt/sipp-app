import { animate, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

/** A number that rolls up to its value (from its previous value on updates). */
export function CountUp({ value, delay = 0, duration = 1, format = (n: number) => String(Math.round(n)) }: { value: number; delay?: number; duration?: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  // What is on screen right now: an update rolls on from there.
  const shown = useRef(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const start = shown.current
    if (reduce || start === value) {
      shown.current = value
      el.textContent = format(value)
      return
    }
    const c = animate(start, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        shown.current = v
        el.textContent = format(v)
      },
    })
    return () => c.stop()
  }, [value, reduce])
  return (
    <span ref={ref} aria-label={format(value)}>
      {format(reduce ? value : 0)}
    </span>
  )
}

/** Progress that pours in: springs to its width, with a slow wave of light running across. */
export function LiquidBar({ value, color = 'var(--primary)', track = 'var(--track)', height = 12, delay = 0.15, label }: { value: number; color?: string; track?: string; height?: number; delay?: number; label?: string }) {
  const v = Math.min(1, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      style={{ flex: 1, height, borderRadius: height / 2, background: track, overflow: 'hidden' }}
    >
      <motion.div
        className="liquid"
        initial={{ width: 0 }}
        animate={{ width: `${v > 0 ? Math.max(v, 0.04) * 100 : 0}%` }}
        transition={{ type: 'spring', stiffness: 70, damping: 16, delay }}
        style={{ height: '100%', borderRadius: height / 2, background: color }}
      />
    </div>
  )
}

/** Ring gauge that fills like the bars. */
export function Ring({ value, size = 84, stroke = 12, color = 'var(--primary)', track = 'var(--track)', delay = 0.2 }: { value: number; size?: number; stroke?: number; color?: string; track?: string; delay?: number }) {
  const r = (size - stroke) / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: Math.min(1, Math.max(0, value)) || 0.0001 }}
        transition={{ type: 'spring', stiffness: 60, damping: 16, delay }}
      />
    </svg>
  )
}

/** Heading lines that rise out of a mask, one after the other. */
export function RevealLines({ lines, delay = 0 }: { lines: { text: string; color?: string }[]; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <>
      {lines.map((l, i) => (
        <span key={l.text + i} style={{ display: 'block', overflow: 'hidden', paddingBottom: '0.06em', marginBottom: '-0.06em' }}>
          <motion.span
            style={{ display: 'block', color: l.color }}
            initial={reduce ? false : { y: '105%' }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', stiffness: 170, damping: 22, delay: delay + i * 0.09 }}
          >
            {l.text}
          </motion.span>
        </span>
      ))}
    </>
  )
}
