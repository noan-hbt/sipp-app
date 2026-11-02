import { AnimatePresence, motion } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { haptic } from '../lib/sound'
import { Icon } from './ui'
import { t } from '../lib/i18n'
import { useWide } from '../lib/layout'

export const TABS = [
  { path: '/', label: t.tabs.today, icon: Icon.today },
  { path: '/library', label: t.tabs.library, icon: Icon.library },
  { path: '/profile', label: t.tabs.me, icon: Icon.user },
] as const

export function isTabPath(path: string) {
  return TABS.some((tab) => tab.path === path)
}

const SPRING = { type: 'spring', stiffness: 520, damping: 40 } as const

/** Floating tab bar (white in light, dark in dark mode): the active tab grows into a pill with its name, plus the « new Sip » button. */
export function TabBar() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  const wide = useWide()
  if (!isTabPath(pathname)) return null
  if (wide) return <TabRail pathname={pathname} go={(path) => nav(path, { replace: true })} create={() => nav('/new')} />
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
        aria-label={t.tabs.nav}
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
        {TABS.map((tab) => {
          const active = pathname === tab.path
          return (
            <motion.button
              key={tab.path}
              layout
              transition={SPRING}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                if (active) return
                haptic()
                nav(tab.path, { replace: true })
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
                {tab.icon}
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
                    {tab.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}
      </nav>
      <motion.button
        aria-label={t.tabs.newSip}
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

/** Large screens: the same tabs as a rail along the left edge (icon over its name), the « new Sip » button on top. */
function TabRail({ pathname, go, create }: { pathname: string; go: (path: string) => void; create: () => void }) {
  return (
    <motion.div
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.1 }}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 'var(--rail)',
        zIndex: 15,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
        padding: 'calc(var(--safe-top) + 18px) 0 calc(var(--safe-bottom) + 18px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        background: 'var(--bg)',
        boxShadow: 'inset -1px 0 0 var(--line-strong)',
        overflowY: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      <motion.button
        aria-label={t.tabs.newSip}
        onClick={() => {
          haptic()
          create()
        }}
        whileTap={{ scale: 0.88, rotate: 90 }}
        whileHover={{ scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        style={{ width: 56, height: 56, borderRadius: 28, border: 'none', background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 10px 24px rgba(217,98,43,.32)' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </motion.button>
      <nav aria-label={t.tabs.nav} style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', padding: '0 8px' }}>
        {TABS.map((tab) => {
          const active = pathname === tab.path
          return (
            <motion.button
              key={tab.path}
              aria-current={active ? 'page' : undefined}
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                if (active) return
                haptic()
                go(tab.path)
              }}
              style={{
                border: 'none',
                background: 'transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '6px 0',
                color: active ? 'var(--nav-pill-ink)' : 'var(--nav-muted)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <span style={{ position: 'relative', width: 56, height: 34, display: 'grid', placeItems: 'center' }}>
                {active && <motion.span layoutId="rail-pill" style={{ position: 'absolute', inset: 0, borderRadius: 17, background: 'var(--nav-pill)' }} transition={SPRING} />}
                <span style={{ position: 'relative', display: 'grid' }}>{tab.icon}</span>
              </span>
              <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.label}</span>
            </motion.button>
          )
        })}
      </nav>
    </motion.div>
  )
}
