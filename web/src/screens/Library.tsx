import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { SipCard, itemVariants as item, listVariants as list } from '../components/SipCard'
import { Icon } from '../components/ui'
import { Api, type Plan } from '../lib/api'
import { play } from '../lib/sound'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

function nextMonth() {
  const d = new Date()
  return `1er ${MONTHS[(d.getMonth() + 1) % 12]}`
}

/** The library: one tile per slot. Filled slots hold a Sip, free ones invite a new Sip. */
export function Library() {
  const nav = useNavigate()
  const sips = useQuery({
    queryKey: ['sips'],
    queryFn: Api.sips,
    refetchInterval: (q) => (q.state.data?.some((s) => s.status === 'queued' || s.status === 'generating') ? 3000 : false),
  })
  const plan = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  const all = sips.data ?? []
  const p = plan.data
  const kept = all.filter((s) => s.status !== 'failed').length
  const free = p ? Math.max(0, Math.min(p.slots - kept, 12)) : 0
  const genLeft = p ? Math.max(0, p.sips_per_month - p.sips_this_month) : 0

  return (
    <Screen kind="fade">
      <header className="topbar" style={{ padding: 'calc(var(--safe-top) + 18px) 22px 6px', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Bibliothèque</h1>
        {p && (
          <span className="muted" style={{ fontSize: 14, fontWeight: 700 }}>
            {kept}/{p.slots >= 1000 ? '∞' : p.slots} emplacements · {p.sips_per_month >= 1000 ? 'générations illimitées' : `${genLeft} génération${genLeft > 1 ? 's' : ''} restante${genLeft > 1 ? 's' : ''}`}
          </span>
        )}
      </header>

      <div className="scroll" style={{ padding: '18px 22px 130px' }}>
        <motion.div variants={list} initial="hidden" animate={sips.isLoading || plan.isLoading ? 'hidden' : 'show'} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
          {all.map((s) => (
            <SipCard key={s.id} sip={s} onOpen={() => nav(s.status === 'ready' ? `/sips/${s.id}` : `/sips/${s.id}/building`)} />
          ))}
          {Array.from({ length: free }, (_, i) => (
            <EmptySlot key={`free-${i}`} canGenerate={genLeft > 0} onClick={() => nav('/new')} />
          ))}
          {p && <UpsellSlot plan={p} onClick={() => nav('/profile', { replace: true })} />}
        </motion.div>
      </div>
    </Screen>
  )
}

function EmptySlot({ canGenerate, onClick }: { canGenerate: boolean; onClick: () => void }) {
  return (
    <motion.button
      variants={item}
      whileTap={canGenerate ? { scale: 0.96 } : undefined}
      disabled={!canGenerate}
      onClick={() => {
        play('pop')
        onClick()
      }}
      className="well"
      style={{
        minHeight: 150,
        border: '2px dashed rgba(43,38,32,.14)',
        borderRadius: 26,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        textAlign: 'center',
        color: 'var(--muted)',
      }}
    >
      <span style={{ width: 40, height: 40, borderRadius: 20, background: canGenerate ? 'var(--ink)' : 'var(--track)', color: canGenerate ? 'var(--bg)' : 'var(--muted)', display: 'grid', placeItems: 'center' }}>
        {Icon.plus}
      </span>
      <span style={{ fontSize: 14, fontWeight: 900, color: canGenerate ? 'var(--ink)' : 'var(--muted)' }}>{canGenerate ? 'Nouveau Sip' : 'Emplacement libre'}</span>
      {!canGenerate && <span style={{ fontSize: 12, fontWeight: 700 }}>Nouvelle génération le {nextMonth()}</span>}
    </motion.button>
  )
}

function UpsellSlot({ plan, onClick }: { plan: Plan; onClick: () => void }) {
  if (plan.plan === 'max' || plan.plan === 'plus') return null
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      style={{
        minHeight: 150,
        border: 'none',
        borderRadius: 26,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        textAlign: 'center',
        background: 'var(--lavender)',
        color: 'var(--lavender-ink)',
      }}
    >
      <span style={{ display: 'grid' }}>{Icon.lock}</span>
      <span style={{ fontSize: 14, fontWeight: 900 }}>Plus d’emplacements</span>
      <span style={{ fontSize: 12, fontWeight: 700 }}>{plan.trial_available ? `Essai gratuit ${plan.trial_days} jours` : 'Avec un abonnement'}</span>
    </motion.button>
  )
}
