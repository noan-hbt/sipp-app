import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { SipSummary } from '../lib/api'
import { play } from '../lib/sound'
import { Mascot } from './Mascot'
import { SipIcon } from './SipIcon'

export const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }
export const itemVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 22 } },
}
const item = itemVariants

/** Library row: topic tile, title, meta line and a thin progress bar. `stacked` draws a card behind (programs). */
export function LibraryRow({
  name,
  meta,
  progress,
  icon,
  tone,
  stacked,
  onOpen,
}: {
  name: string
  meta: ReactNode
  progress: number | null
  icon?: ReactNode
  tone?: string
  stacked?: boolean
  onOpen: () => void
}) {
  return (
    <motion.div variants={item} layout style={{ position: 'relative', paddingTop: stacked ? 6 : 0 }}>
      {stacked && <span style={{ position: 'absolute', left: 12, right: 12, top: 0, height: 24, borderRadius: 18, background: 'var(--bg-deep)' }} />}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => {
          play('tap')
          onOpen()
        }}
        style={{ position: 'relative', width: '100%', border: 'none', textAlign: 'left', borderRadius: 24, padding: '10px 14px 10px 10px', display: 'flex', alignItems: 'center', gap: 12, background: tone ?? 'var(--surface)' }}
      >
        {icon ?? <SipIcon text={name} size={60} />}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            <span style={{ fontSize: 13, color: 'var(--faint)' }}>{meta}</span>
          </div>
          {progress !== null && (
            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-deep)', overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(progress, 0.03) * 100}%` }}
                transition={{ type: 'spring', stiffness: 90, damping: 18, delay: 0.2 }}
                style={{ height: '100%', borderRadius: 3, background: progress >= 1 ? 'var(--mint-strong)' : 'var(--primary)' }}
              />
            </div>
          )}
        </div>
      </motion.button>
    </motion.div>
  )
}

export function SipCard({ sip, onOpen }: { sip: SipSummary; onOpen: () => void }) {
  const building = sip.status === 'queued' || sip.status === 'generating'
  const failed = sip.status === 'failed'
  const done = sip.progress.total > 0 && sip.progress.completed >= sip.progress.total
  const name = sip.title ?? sip.input_text
  return (
    <LibraryRow
      name={name}
      onOpen={onOpen}
      tone={failed ? 'var(--rose-soft)' : undefined}
      icon={
        building ? (
          <span style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--peach-soft)', display: 'grid', placeItems: 'center' }}>
            <Mascot mood="think" size={46} />
          </span>
        ) : failed ? (
          <span style={{ width: 60, height: 60, borderRadius: 18, background: '#fff', display: 'grid', placeItems: 'center' }}>
            <Mascot mood="oops" size={46} />
          </span>
        ) : undefined
      }
      meta={
        building ? (
          'Je trace ton chemin…'
        ) : failed ? (
          <span style={{ color: 'var(--rose-ink)', fontWeight: 600 }}>Raté, touche pour réessayer</span>
        ) : done ? (
          `Terminé · ${sip.progress.total} leçons`
        ) : (
          `${sip.progress.completed} / ${sip.progress.total} leçons${sip.lite ? ' · découverte' : ''}`
        )
      }
      progress={building || failed ? null : sip.progress.completed / Math.max(1, sip.progress.total)}
    />
  )
}
