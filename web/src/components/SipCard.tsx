import { motion } from 'motion/react'
import type { SipSummary } from '../lib/api'
import { play } from '../lib/sound'
import { Mascot } from './Mascot'
import { SipIcon, sipPalette } from './SipIcon'

export const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }
export const itemVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 22 } },
}
const item = itemVariants

export function SipCard({ sip, onOpen }: { sip: SipSummary; onOpen: () => void }) {
  const building = sip.status === 'queued' || sip.status === 'generating'
  const failed = sip.status === 'failed'
  const done = sip.progress.total > 0 && sip.progress.completed >= sip.progress.total
  const pal = sipPalette(sip.id)
  return (
    <motion.button
      variants={item}
      layout
      onClick={() => {
        play('tap')
        onOpen()
      }}
      whileTap={{ scale: 0.96 }}
      className={building ? 'inset' : 'raised'}
      style={{ border: 'none', textAlign: 'left', borderRadius: 26, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: failed ? 'var(--rose-soft)' : 'var(--bg)' }}
    >
      {building ? <Mascot mood="think" size={48} /> : failed ? <Mascot mood="oops" size={48} /> : <SipIcon id={sip.id} />}
      <span style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.25 }}>{sip.title ?? sip.input_text}</span>
      {building ? (
        <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>
          Je trace ton chemin…
        </span>
      ) : failed ? (
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--rose-ink)' }}>Raté, touche pour réessayer</span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-deep)' }}>
            <div style={{ width: `${(sip.progress.completed / Math.max(1, sip.progress.total)) * 100}%`, height: '100%', borderRadius: 4, background: pal.bar }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 900, color: done ? 'var(--mint-ink)' : 'var(--muted)' }}>
            {done ? 'Fini' : `${sip.progress.completed}/${sip.progress.total}`}
          </span>
        </div>
      )}
    </motion.button>
  )
}
