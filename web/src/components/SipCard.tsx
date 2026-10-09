import { motion } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'
import type { SipSummary } from '../lib/api'
import { play } from '../lib/sound'
import { Mascot } from './Mascot'
import { LiquidBar } from './motion'
import { sipPalette, topicArt } from './SipIcon'
import { Icon } from './ui'

export const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }
export const itemVariants = {
  hidden: { opacity: 0, y: 22, scale: 0.94 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 20 } },
}
const item = itemVariants

/** Bento tile: illustration spilling over the top corner, title, meta line and a liquid progress bar. `stacked` draws a card behind (programs). */
export function Tile({
  name,
  meta,
  metaColor,
  progress,
  art,
  bg,
  ink,
  stacked,
  wide,
  index = 0,
  onOpen,
}: {
  name: string
  meta: ReactNode
  metaColor?: string
  progress: number | null
  art: ReactNode
  bg: string
  ink: string
  stacked?: boolean
  wide?: boolean
  index?: number
  onOpen: () => void
}) {
  return (
    <motion.div variants={item} layout style={{ position: 'relative', gridColumn: wide ? '1 / -1' : undefined, paddingTop: stacked ? 9 : 0 }}>
      {stacked && <span aria-hidden="true" style={{ position: 'absolute', left: 14, right: 14, top: 0, height: 30, borderRadius: 20, background: bg, opacity: 0.55 }} />}
      <motion.button
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 600, damping: 26 }}
        onClick={() => {
          play('tap')
          onOpen()
        }}
        style={{ position: 'relative', width: '100%', height: 186, border: 'none', textAlign: 'left', borderRadius: 26, padding: 14, background: bg, color: 'var(--ink)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6 }}
      >
        <span
          aria-hidden="true"
          className="float"
          style={{ position: 'absolute', top: -12, right: -6, width: 98, height: 98, display: 'grid', placeItems: 'center', animationDelay: `${-index * 1.3}s`, '--tilt': index % 2 ? '-5deg' : '5deg' } as CSSProperties}
        >
          {art}
        </span>
        <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.18, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{name}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: metaColor ?? ink, display: 'flex', alignItems: 'center', gap: 5 }}>{meta}</span>
        {progress !== null && (
          <span style={{ display: 'flex' }}>
            <LiquidBar value={progress} color={ink} track="var(--frost)" height={7} delay={0.3 + index * 0.05} />
          </span>
        )}
      </motion.button>
    </motion.div>
  )
}

const isDone = (s: SipSummary) => s.progress.total > 0 && s.progress.completed >= s.progress.total

/** A Sip as a bento tile, whatever its state (building, failed, in progress, done). */
export function SipTile({ sip, index, onOpen }: { sip: SipSummary; index?: number; onOpen: () => void }) {
  const building = sip.status === 'queued' || sip.status === 'generating'
  const failed = sip.status === 'failed'
  const done = isDone(sip)
  const name = sip.title ?? sip.input_text
  const pal = sipPalette(name)
  return (
    <Tile
      name={name}
      index={index}
      onOpen={onOpen}
      bg={failed ? 'var(--rose-soft)' : building ? 'var(--surface)' : pal.bg}
      ink={failed ? 'var(--rose-ink)' : pal.ink}
      metaColor={building ? 'var(--muted)' : undefined}
      art={building ? <Mascot mood="think" size={80} /> : failed ? <Mascot mood="oops" size={80} /> : <img src={topicArt(name)} alt="" width={98} height={98} draggable={false} />}
      meta={
        building ? (
          'Je prépare ton parcours…'
        ) : failed ? (
          'Raté, touche pour réessayer'
        ) : done ? (
          <>
            {Icon.check(14)} Terminé · {sip.progress.total} leçons
          </>
        ) : sip.chapter ? (
          `Chapitre ${sip.chapter} · ${sip.progress.completed}/${sip.progress.total}`
        ) : (
          `${sip.progress.completed}/${sip.progress.total} leçons${sip.lite ? ' · découverte' : ''}`
        )
      }
      progress={building || failed ? null : sip.progress.completed / Math.max(1, sip.progress.total)}
    />
  )
}
