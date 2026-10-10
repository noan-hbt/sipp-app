import { AnimatePresence, motion } from 'motion/react'
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

const SPRING = { type: 'spring', stiffness: 520, damping: 40 } as const

/** Floating tab bar (white in light, dark in dark mode): the active tab grows into a pill with its name, plus the « new Sip » button. */
export function TabBar() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  if (!isTabPath(pathname)) return null
  return (
    <motion.div
      initial={{ y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.15 }}
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
          height: 64,
          borderRadius: 32,
          padding: 7,
          display: 'flex',
          gap: 4,
          background: 'var(--nav-bg)',
          boxShadow: 'var(--nav-shadow), inset 0 0 0 1px var(--nav-line)',
        }}
      >
        {TABS.map((t) => {
          const active = pathname === t.path
          return (
            <motion.button
              key={t.path}
              layout
              transition={SPRING}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                if (active) return
                haptic()
                nav(t.path, { replace: true })
              }}
              style={{
                flex: active ? '1.9 1 0' : '1 1 0',
                minWidth: 0,
                border: 'none',
                background: 'transparent',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                color: active ? 'var(--nav-pill-ink)' : 'var(--nav-muted)',
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 25,
              }}
            >
              {active && <motion.span layoutId="tab-pill" style={{ position: 'absolute', inset: 0, borderRadius: 25, background: 'var(--nav-pill)' }} transition={SPRING} />}
              <motion.span layout="position" style={{ position: 'relative', display: 'grid' }}>
                {t.icon}
              </motion.span>
              <AnimatePresence initial={false}>
                {active && (
                  <motion.span
                    key="label"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: 0.08 } }}
                    exit={{ opacity: 0, transition: { duration: 0.08 } }}
                    style={{ position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    aria-hidden="true"
                  >
                    {t.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}
      </nav>
      <motion.button
        aria-label="Apprendre quelque chose de nouveau"
        onClick={() => {
          haptic()
          nav('/new')
        }}
        whileTap={{ scale: 0.88, rotate: 90 }}
        whileHover={{ scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        style={{ width: 64, height: 64, borderRadius: 32, border: 'none', background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 14px 30px rgba(217,98,43,.35)' }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </motion.button>
    </motion.div>
  )
}
