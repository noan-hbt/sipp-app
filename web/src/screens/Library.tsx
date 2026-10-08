import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { LibraryRow, SipCard, itemVariants as item, listVariants as list } from '../components/SipCard'
import { illustration } from '../components/SipIcon'
import { Icon } from '../components/ui'
import { Api, type Plan, type Program, type SipSummary } from '../lib/api'
import { play } from '../lib/sound'
import { Notebook } from './Notebook'
import { chapterState, nextChapter } from './ProgramView'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

function nextMonth() {
  const d = new Date()
  return `1er ${MONTHS[(d.getMonth() + 1) % 12]}`
}

type Filter = 'all' | 'progress' | 'programs' | 'done'
const FILTERS: [Filter, string][] = [
  ['all', 'Tout'],
  ['progress', 'En cours'],
  ['programs', 'Programmes'],
  ['done', 'Terminés'],
]

const sipDone = (s: SipSummary) => s.progress.total > 0 && s.progress.completed >= s.progress.total
const progDone = (p: Program) => p.chapters.length > 0 && p.chapters.every((c) => chapterState(c, nextChapter(p)) === 'done')

/** The library: a slot gauge, filters, then one row per Sip or program. Free slots invite a new Sip. */
export function Library() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'notions' ? 'notions' : 'sips'
  const [filter, setFilter] = useState<Filter>('all')
  const sips = useQuery({
    queryKey: ['sips'],
    queryFn: Api.sips,
    refetchInterval: (q) => (q.state.data?.some((s) => s.status === 'queued' || s.status === 'generating') ? 3000 : false),
  })
  const plan = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  const programs = useQuery({
    queryKey: ['programs'],
    queryFn: Api.programs,
    refetchInterval: (q) => (q.state.data?.some((p) => p.status === 'generating') ? 3000 : false),
  })
  // A slot holds a standalone Sip or a whole program (its chapters live inside it).
  const all = (sips.data ?? []).filter((s) => !s.program_id)
  const progs = programs.data ?? []
  const p = plan.data
  const kept = all.filter((s) => s.status !== 'failed').length + progs.length
  const unlimited = p ? p.slots >= 1000 : false
  const free = p ? (unlimited ? 1 : Math.max(0, Math.min(p.slots - kept, 12))) : 0
  const genLeft = p ? Math.max(0, p.sips_per_month - p.sips_this_month) : 0
  const shownProgs = progs.filter((pr) => (filter === 'done' ? progDone(pr) : filter === 'progress' ? !progDone(pr) : true))
  const shownSips = filter === 'programs' ? [] : all.filter((s) => (filter === 'done' ? sipDone(s) : filter === 'progress' ? !sipDone(s) : true))
  const loading = sips.isLoading || plan.isLoading || programs.isLoading
  const queries = [sips, plan, programs]
  const offline = queries.some((q) => q.isPaused)
  const failed = queries.some((q) => q.isError)
  const loaded = sips.data !== undefined && programs.data !== undefined

  return (
    <Screen kind="fade">
      <header className="topbar" style={{ padding: 'calc(var(--safe-top) + 18px) 20px 4px' }}>
        <h1 className="display" style={{ fontSize: 30 }}>
          Bibliothèque
        </h1>
      </header>
      <div role="tablist" aria-label="Bibliothèque" style={{ margin: '8px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', padding: 4, borderRadius: 18, background: 'var(--bg-deep)' }}>
        {(
          [
            ['sips', 'Mes Sips'],
            ['notions', 'Notions'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              play('tap')
              setParams(k === 'sips' ? {} : { tab: k }, { replace: true })
            }}
            style={{ position: 'relative', height: 40, border: 'none', borderRadius: 14, background: 'transparent', color: tab === k ? 'var(--ink)' : 'var(--muted)', fontSize: 15, fontWeight: 600 }}
          >
            {tab === k && <motion.span layoutId="lib-tab" transition={{ type: 'spring', stiffness: 500, damping: 36 }} style={{ position: 'absolute', inset: 0, borderRadius: 14, background: 'var(--surface)' }} />}
            <span style={{ position: 'relative' }}>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'notions' ? (
        <Notebook />
      ) : (
        <div className="scroll" style={{ padding: '10px 16px 130px' }}>
          {(offline || failed) && <ErrorNotice message={offline ? 'Tu es hors ligne. Reconnecte-toi pour actualiser ta bibliothèque.' : 'Impossible d’actualiser ta bibliothèque. Réessaie.'} retry={() => { queries.forEach((q) => { void q.refetch() }) }} busy={queries.some((q) => q.isFetching)} />}
          {loading && <p className="muted" role="status" style={{ margin: '12px 0' }}>Chargement de ta bibliothèque…</p>}
          {p && loaded && (
            <div style={{ borderRadius: 22, background: 'var(--lavender)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--lavender-ink)' }}>
                <span>{unlimited ? `${kept} Sips gardés` : `${kept} place${kept > 1 ? 's' : ''} sur ${p.slots}`}</span>
                <span style={{ fontWeight: 500 }}>{p.sips_per_month >= 1000 ? 'Créations illimitées' : `${genLeft} création${genLeft > 1 ? 's' : ''} ce mois`}</span>
              </div>
              {!unlimited && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(p.slots, 15)}, minmax(0, 1fr))`, gap: 5 }}>
                  {Array.from({ length: Math.min(p.slots, 15) }, (_, i) => (
                    <motion.span
                      key={i}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: 0.05 * i }}
                      style={{ height: 10, borderRadius: 5, background: i < kept ? 'var(--lavender-strong)' : '#fff' }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, margin: '14px -16px 0', padding: '0 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {FILTERS.map(([k, label]) => (
              <motion.button
                key={k}
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  play('tap')
                  setFilter(k)
                }}
                style={{
                  height: 38,
                  padding: '0 15px',
                  borderRadius: 19,
                  border: 'none',
                  whiteSpace: 'nowrap',
                  fontSize: 14,
                  fontWeight: 600,
                  background: filter === k ? 'var(--ink)' : 'var(--surface)',
                  color: filter === k ? '#fff' : 'var(--ink)',
                }}
              >
                {label}
              </motion.button>
            ))}
          </div>

          <motion.div key={filter} variants={list} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {shownProgs.map((pr) => (
              <ProgramRow key={pr.id} program={pr} onOpen={() => nav(`/programs/${pr.id}`)} />
            ))}
            {shownSips.map((s) => (
              <SipCard key={s.id} sip={s} onOpen={() => nav(s.status === 'ready' ? `/sips/${s.id}` : `/sips/${s.id}/building`)} />
            ))}
            {loaded && filter !== 'all' && shownProgs.length + shownSips.length === 0 && (
              <motion.div variants={item} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '24px 0', textAlign: 'center' }}>
                <img src={illustration('scene-empty')} alt="" width={150} height={150} />
                <span className="muted" style={{ fontSize: 15 }}>
                  Rien ici pour l’instant.
                </span>
              </motion.div>
            )}
            {loaded && filter === 'all' && Array.from({ length: free }, (_, i) => <EmptySlot key={`free-${i}`} canGenerate={genLeft > 0} onClick={() => nav('/new')} />)}
            {loaded && filter === 'all' && p && <UpsellSlot plan={p} onClick={() => nav('/offers')} />}
          </motion.div>
        </div>
      )}
    </Screen>
  )
}

function ProgramRow({ program: p, onOpen }: { program: Program; onOpen: () => void }) {
  const next = nextChapter(p)
  const done = p.chapters.filter((c) => chapterState(c, next) === 'done').length
  const current = p.chapters.find((c) => chapterState(c, next) !== 'done')
  const generating = p.status === 'generating'
  return (
    <LibraryRow
      name={p.title ?? 'Programme'}
      stacked
      onOpen={onOpen}
      icon={
        generating ? (
          <span style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--peach-soft)', display: 'grid', placeItems: 'center' }}>
            <Mascot mood="think" size={46} />
          </span>
        ) : undefined
      }
      meta={generating ? 'Je dessine la suite…' : `Programme · ${current ? `chapitre ${current.position} sur ${p.chapters.length}` : 'terminé'}`}
      progress={generating ? null : done / Math.max(1, p.chapters.length)}
    />
  )
}

function EmptySlot({ canGenerate, onClick }: { canGenerate: boolean; onClick: () => void }) {
  return (
    <motion.button
      variants={item}
      whileTap={canGenerate ? { scale: 0.97 } : undefined}
      disabled={!canGenerate}
      onClick={() => {
        play('pop')
        onClick()
      }}
      style={{
        border: '2px dashed var(--line-strong)',
        background: 'transparent',
        borderRadius: 24,
        padding: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        color: 'var(--muted)',
      }}
    >
      <span style={{ width: 56, height: 56, borderRadius: 18, background: canGenerate ? 'var(--primary)' : 'var(--bg-deep)', color: canGenerate ? '#fff' : 'var(--faint)', display: 'grid', placeItems: 'center' }}>
        {Icon.plus}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: canGenerate ? 'var(--ink)' : 'var(--muted)' }}>{canGenerate ? 'Nouveau Sip' : 'Place libre'}</span>
        <span style={{ fontSize: 13 }}>{canGenerate ? 'Une place t’attend' : `Nouvelle création le ${nextMonth()}`}</span>
      </div>
    </motion.button>
  )
}

function UpsellSlot({ plan, onClick }: { plan: Plan; onClick: () => void }) {
  if (plan.plan === 'max' || plan.plan === 'plus') return null
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{ border: 'none', borderRadius: 24, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'var(--butter)', color: 'var(--butter-ink)' }}
    >
      <img src={illustration('scene-full')} alt="" width={56} height={56} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Plus de places</span>
        <span style={{ fontSize: 13 }}>{plan.trial_available ? `Essai gratuit de ${plan.trial_days} jours` : 'Avec un abonnement'}</span>
      </div>
    </motion.button>
  )
}
