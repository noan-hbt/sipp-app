import { motion } from 'motion/react'
import { ApiError } from '../lib/api'
import { t } from '../lib/i18n'
import { Mascot } from './Mascot'

export interface RefusalInfo { message: string; selfHarm: boolean }

/** A request Sipp will not teach (`topic_refused`): its kind note, if the error is one. */
export function refusalOf(error: unknown): RefusalInfo | null {
  if (!(error instanceof ApiError) || error.code !== 'topic_refused') return null
  const d = error.detail as { message?: string; kind?: string } | undefined
  return { message: d?.message || t.safety.refused, selfHarm: d?.kind === 'self_harm' }
}

/** The kind note, plus where to find help when the request was about hurting oneself. */
export function Refusal({ info }: { info: RefusalInfo }) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 22, background: 'var(--lavender)', color: 'var(--lavender-ink)' }}
    >
      <Mascot mood="hello" size={44} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.45 }}>
        <p style={{ fontWeight: 600, color: 'var(--ink)' }}>{info.message}</p>
        {info.selfHarm && <p>{t.safety.help}</p>}
        <p>{t.safety.other}</p>
      </div>
    </motion.div>
  )
}
