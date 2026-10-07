import { motion } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { haptic } from '../lib/sound'
import { Icon } from './ui'

export const TABS = [
  { path: '/', label: 'Aujourd’hui', icon: Icon.today },
  { path: '/library', label: 'Bibliothèque', icon: Icon.library },
  { path: '/profile', label: 'Profil', icon: Icon.user },
] as const

export function isTabPath(path: string) {
  return TABS.some((t) => t.path === path)
}

/** Bottom navigation between the three main screens; hidden everywhere else. */
export function TabBar() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  if (!isTabPath(pathname)) return null
  return (
    <nav
      aria-label="Navigation principale"
      className="card"
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 'calc(var(--safe-bottom) + 10px)',
        zIndex: 15,
        height: 66,
        borderRadius: 33,
        padding: 6,
        display: 'flex',
        gap: 4,
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
              color: active ? 'var(--ink)' : 'var(--muted)',
              fontSize: 11.5,
              fontWeight: 900,
            }}
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                style={{ position: 'absolute', inset: 0, borderRadius: 27, background: 'var(--peach-soft)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span style={{ position: 'relative', display: 'grid' }}>{t.icon}</span>
            <span style={{ position: 'relative' }}>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
