import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { haptic, play } from '../lib/sound'

type Variant = 'peach' | 'dark' | 'soft' | 'mint' | 'ghost'

const VARIANTS: Record<Variant, { bg: string; color: string; lip: string; shadow?: string }> = {
  peach: { bg: 'var(--peach)', color: 'var(--ink)', lip: 'var(--peach-lip)' },
  dark: { bg: 'var(--ink)', color: '#F7F1E8', lip: '#000' },
  mint: { bg: 'var(--mint)', color: 'var(--mint-ink)', lip: 'var(--mint-lip)' },
  soft: { bg: 'var(--bg)', color: 'var(--ink)', lip: 'transparent', shadow: 'var(--raised)' },
  ghost: { bg: 'transparent', color: 'var(--ink)', lip: 'transparent', shadow: 'none' },
}

/** Chunky button: sinks onto its lip when pressed, with a tap sound. */
export function Button({
  variant = 'peach',
  children,
  onClick,
  disabled,
  sound = null,
  style,
  ...rest
}: {
  variant?: Variant
  children: ReactNode
  sound?: 'tap' | 'pop' | null
} & Omit<HTMLMotionProps<'button'>, 'children'>) {
  const v = VARIANTS[variant]
  const lip = v.lip === 'transparent' ? 0 : 5
  return (
    <motion.button
      {...rest}
      disabled={disabled}
      onClick={(e) => {
        if (disabled) return
        if (sound) play(sound)
        haptic()
        onClick?.(e)
      }}
      initial={false}
      animate={{ opacity: disabled ? 0.45 : 1 }}
      whileTap={disabled ? undefined : { y: lip, scale: 0.985 }}
      whileHover={disabled ? undefined : { scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      style={{
        height: 60,
        width: '100%',
        borderRadius: 30,
        border: 'none',
        background: v.bg,
        color: v.color,
        fontSize: 18,
        fontWeight: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        boxShadow: v.shadow ?? `0 ${lip}px 0 ${v.lip}, 0 12px 20px rgba(120,80,40,.18)`,
        cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
    >
      {children}
    </motion.button>
  )
}

/** Round neumorphic icon button. */
export function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return (
    <motion.button
      className="icon-btn"
      aria-label={label}
      onClick={() => {
        haptic()
        onClick?.()
      }}
      whileTap={{ scale: 0.9, boxShadow: 'var(--inset-sm)' }}
      transition={{ type: 'spring', stiffness: 600, damping: 25 }}
    >
      {children}
    </motion.button>
  )
}

export function ProgressBar({ value, color = 'var(--peach)', height = 16 }: { value: number; color?: string; height?: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      style={{ flex: 1, height, borderRadius: height / 2, padding: 3, background: 'var(--track)' }}
    >
      <motion.div
        initial={false}
        animate={{ width: `${Math.max(value, 0.04) * 100}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        style={{ height: '100%', borderRadius: (height - 6) / 2, background: color, position: 'relative', overflow: 'hidden' }}
      >
        <span
          style={{
            position: 'absolute',
            inset: '2px 6px auto',
            height: Math.max(2, (height - 6) / 3),
            borderRadius: 4,
            background: 'rgba(255,255,255,.35)',
          }}
        />
      </motion.div>
    </div>
  )
}

export function Star({ size = 16, filled = true, delay = 0, animate = false }: { size?: number; filled?: boolean; delay?: number; animate?: boolean }) {
  const reduce = useReducedMotion()
  useEffect(() => {
    if (!animate || !filled) return
    const t = setTimeout(() => play('star'), delay * 1000 + 80)
    return () => clearTimeout(t)
  }, [animate, filled, delay])
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      initial={animate && !reduce ? { scale: 0, rotate: -90 } : false}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 12, delay }}
    >
      <path
        d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6L2.5 9.3l6.6-.8z"
        fill={filled ? 'var(--star)' : 'var(--bg-deep)'}
        stroke={filled ? '#D9A42C' : 'var(--shadow-dark)'}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </motion.svg>
  )
}

export const Icon = {
  back: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  close: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  check: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5 9-10" />
    </svg>
  ),
  cross: (s = 18, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  play: (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 001.5.9l10-6.5a1 1 0 000-1.7l-10-6.5A1 1 0 008 5.5z" fill="var(--ink)" />
    </svg>
  ),
  lock: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="3" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  flame: (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3-1-5 1-8z" fill="var(--peach)" />
    </svg>
  ),
  sound: (on: boolean) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9z" />
      {on ? <path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" /> : <path d="M17 9l5 6M22 9l-5 6" />}
    </svg>
  ),
  list: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  ),
  map: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <path d="M8.4 18H15a3 3 0 000-6H9a3 3 0 010-6h6.6" />
    </svg>
  ),
  user: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  ),
  today: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 10h12v5a5 5 0 01-5 5h-2a5 5 0 01-5-5z" />
      <path d="M17 11.5h1a2.5 2.5 0 010 5h-1.4" />
      <path d="M9 3.5c-.9 1 .9 1.7 0 2.8M13 3.5c-.9 1 .9 1.7 0 2.8" />
    </svg>
  ),
  library: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2.2" />
      <path d="M17 14v6M14 17h6" />
    </svg>
  ),
}
