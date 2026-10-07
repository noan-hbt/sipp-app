import { motion } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { haptic } from '../lib/sound'
import { Icon } from './ui'

export const TABS = [
  { path: '/', label: 'Aujourd’hui', icon: Icon.today },
  { path: '/library', label: 'Bibliothèque', icon: Icon.library },
  { path: '/profile', label: 'Moi', icon: Icon.user },
] as const

export function isTabPath(path: string) {
  return TABS.some((t) => t.path === path)
}

/** Floating bottom navigation between the three main screens, plus the « new Sip » button. */
export function TabBar() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  if (!isTabPath(pathname)) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 'calc(var(--safe-bottom) + 12px)',
        zIndex: 15,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
    <nav
      aria-label="Navigation principale"
      style={{
        flex: 1,
        height: 62,
        borderRadius: 31,
        padding: 6,
        display: 'flex',
        gap: 4,
        background: 'var(--surface)',
        boxShadow: '0 8px 24px rgba(29,26,23,.08)',
      }}
    >
      {TABS.map((t) => {
        const active = pathname === t.path
        return (
          <button
            key={t.path}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              if (active) return
              haptic()
              nav(t.path, { replace: true })
            }}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              color: active ? 'var(--primary)' : 'var(--faint)',
              fontSize: 11,
              fontWeight: active ? 600 : 500,
            }}
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                style={{ position: 'absolute', inset: 0, borderRadius: 25, background: 'var(--primary-soft)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span style={{ position: 'relative', display: 'grid' }}>{t.icon}</span>
            <span style={{ position: 'relative' }}>{t.label}</span>
          </button>
        )
      })}
    </nav>
    <motion.button
      aria-label="Apprendre quelque chose de nouveau"
      onClick={() => {
        haptic()
        nav('/new')
      }}
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      style={{ width: 62, height: 62, borderRadius: 31, border: 'none', background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </motion.button>
    </div>
  )
}
