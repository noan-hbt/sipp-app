import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { haptic, play } from '../lib/sound'

type Variant = 'peach' | 'dark' | 'soft' | 'mint' | 'ghost'

const VARIANTS: Record<Variant, { bg: string; color: string; shadow?: string }> = {
  peach: { bg: 'var(--primary)', color: '#fff' },
  dark: { bg: 'var(--ink)', color: 'var(--on-ink)' },
  mint: { bg: 'var(--mint-lip)', color: '#fff' },
  soft: { bg: 'var(--surface)', color: 'var(--ink)', shadow: 'inset 0 0 0 2px var(--line-strong)' },
  ghost: { bg: 'transparent', color: 'var(--primary)', shadow: 'none' },
}

/** Flat pill button: squishes a little when pressed, with a tap sound. */
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
      whileTap={disabled ? undefined : { scale: 0.96 }}
      whileHover={disabled ? undefined : { scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      style={{
        height: 56,
        width: '100%',
        borderRadius: 28,
        border: 'none',
        background: v.bg,
        color: v.color,
        fontSize: 17,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        boxShadow: v.shadow ?? 'none',
        cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
    >
      {children}
    </motion.button>
  )
}

/** Small rounded-square icon button. */
export function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return (
    <motion.button
      className="icon-btn"
      aria-label={label}
      onClick={() => {
        haptic()
        onClick?.()
      }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 600, damping: 25 }}
    >
      {children}
    </motion.button>
  )
}

export function ProgressBar({ value, color = 'var(--primary)', height = 10 }: { value: number; color?: string; height?: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      style={{ flex: 1, height, borderRadius: height / 2, background: 'var(--track)', overflow: 'hidden' }}
    >
      <motion.div
        initial={false}
        animate={{ width: `${Math.max(value, 0.04) * 100}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        style={{ height: '100%', borderRadius: height / 2, background: color }}
      />
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
        fill={filled ? 'var(--star)' : 'var(--line)'}
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
      <path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3-1-5 1-8z" fill="var(--coral)" />
      <path d="M12 12c.5 2 3 3 3 5.5a3 3 0 01-6 0c0-1.5 1-2.5 1.5-3.5.5 1 1 1.5 1.5 1.5z" fill="var(--sun)" />
    </svg>
  ),
  snow: (s = 16, c = 'var(--sky-ink)') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 3 3-3M9 20l3-3 3 3" />
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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.2l8.5 6.6V20a1 1 0 01-1 1H15v-6H9v6H4.5a1 1 0 01-1-1V9.8z" />
    </svg>
  ),
  library: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h5v16H4zM10.5 4h5v16h-5zM17.5 5l3 .8-3.6 14.4-3-.8" />
    </svg>
  ),
}
