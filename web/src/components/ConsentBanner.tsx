import { AnimatePresence, motion } from 'motion/react'
import { useSyncExternalStore } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { currentConsent, onConsent, setConsent } from '../lib/consent'
import { t } from '../lib/i18n'
import { analyticsAvailable } from '../lib/telemetry'
import { Button } from './ui'

/** Asked once, before any usage statistics: refusing is as easy as accepting. Hidden while reading the legal pages. */
export function ConsentBanner() {
  const consent = useSyncExternalStore(onConsent, currentConsent)
  const { pathname } = useLocation()
  const open = analyticsAvailable && consent === null && !pathname.startsWith('/legal')
  return (
    <AnimatePresence>
      {open && (
        <motion.section
          role="dialog"
          aria-label={t.legal.consent.label}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(var(--safe-bottom) + 12px)', zIndex: 50, maxWidth: 460, margin: '0 auto', borderRadius: 24, padding: 16, background: 'var(--surface)', boxShadow: '0 12px 40px rgba(29,26,23,.22)', display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <p style={{ fontSize: 14, lineHeight: 1.45 }}>
            {t.legal.consent.text}{' '}
            <Link to="/legal/privacy" style={{ color: 'var(--primary)', fontWeight: 600 }}>{t.legal.consent.more}</Link>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Button variant="soft" onClick={() => setConsent('denied')} style={{ height: 46, fontSize: 15 }}>{t.legal.consent.refuse}</Button>
            <Button variant="soft" onClick={() => setConsent('granted')} style={{ height: 46, fontSize: 15 }}>{t.legal.consent.accept}</Button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
