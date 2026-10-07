import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useNavigate, useParams } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { itemVariants as item, listVariants as list } from '../components/SipCard'
import { SipIcon } from '../components/SipIcon'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, ApiError, type Chapter, type Program } from '../lib/api'
import { duration } from '../lib/format'
import { play } from '../lib/sound'

const ERRORS: Record<string, string> = {
  monthly_limit: 'Tu as utilisé tes générations du mois. Ce chapitre sera disponible le mois prochain, ou avec un abonnement.',
  daily_budget_reached: 'J’ai assez réfléchi pour aujourd’hui. On reprend demain ?',
}

export type ChapterState = 'done' | 'current' | 'building' | 'next' | 'later'

export function chapterState(c: Chapter, next: number | undefined): ChapterState {
  const s = c.sip
  if (!s) return c.position === next ? 'next' : 'later'
  if (s.status !== 'ready') return 'building'
  return s.progress.total > 0 && s.progress.completed >= s.progress.total ? 'done' : 'current'
}

/** First chapter not generated yet: the one the learner is invited to prepare. */
export function nextChapter(p: Program) {
  return p.chapters.find((c) => !c.sip)?.position
}

export function ProgramView() {
  const { programId = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const program = useQuery({
    queryKey: ['program', programId],
    queryFn: () => Api.program(programId),
    refetchInterval: (q) =>
      q.state.data?.status === 'generating' || q.state.data?.chapters.some((c) => c.sip && c.sip.status !== 'ready' && c.sip.status !== 'failed') ? 2500 : false,
  })
  const start = useMutation({
    mutationFn: (position: number) => Api.startChapter(programId, position),
    onSuccess: (sip) => {
      play('whoosh')
      void qc.invalidateQueries({ queryKey: ['program', programId] })
      void qc.invalidateQueries({ queryKey: ['sips'] })
      void qc.invalidateQueries({ queryKey: ['plan'] })
      nav(`/sips/${sip.id}/building`)
    },
    onError: () => play('wrong'),
  })
  const remove = useMutation({
    mutationFn: () => Api.deleteProgram(programId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['programs'] })
      void qc.invalidateQueries({ queryKey: ['sips'] })
      void qc.invalidateQueries({ queryKey: ['plan'] })
      nav('/library', { replace: true })
    },
  })
  const p = program.data

  if (!p || p.status !== 'ready') {
    return (
      <Screen>
        <header className="topbar">
          <IconButton label="Retour" onClick={() => nav(-1)}>
            {Icon.back}
          </IconButton>
        </header>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 32px 80px', textAlign: 'center' }}>
          <div className="raised" style={{ width: 150, height: 150, borderRadius: 75, display: 'grid', placeItems: 'center' }}>
            <Mascot mood={p?.status === 'failed' ? 'oops' : 'think'} size={104} />
          </div>
          <h1 className="title-l">{p?.status === 'failed' ? 'La suite m’a résisté' : p ? 'Je dessine la suite…' : ''}</h1>
          {p?.status === 'generating' && (
            <p className="muted" style={{ fontSize: 15, fontWeight: 700 }}>
              Je cherche les prochaines étapes à partir de ce que tu as appris.
            </p>
          )}
        </div>
      </Screen>
    )
  }

  const next = nextChapter(p)
  const totalLessons = p.chapters.reduce((n, c) => n + (c.sip?.progress.total || c.estimated_lessons), 0)
  const done = p.chapters.filter((c) => chapterState(c, next) === 'done').length
  const core = p.chapters.filter((c) => c.level === 'core')
  const advanced = p.chapters.filter((c) => c.level !== 'core')
  const err = start.error instanceof ApiError ? (ERRORS[start.error.code ?? ''] ?? 'Oups, réessaie dans un instant.') : start.error ? 'Impossible de joindre Sipp.' : null

  const section = (title: string, chapters: Chapter[]) =>
    chapters.length > 0 && (
      <motion.section variants={item} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: '#9c4a22', textTransform: 'uppercase', letterSpacing: '.06em', marginLeft: 4 }}>{title}</span>
        {chapters.map((c) => (
          <ChapterCard
            key={c.position}
            chapter={c}
            state={chapterState(c, next)}
            last={c.position === p.chapters.length}
            starting={start.isPending && start.variables === c.position}
            onOpen={() => c.sip && nav(c.sip.status === 'ready' ? `/sips/${c.sip.id}` : `/sips/${c.sip.id}/building`)}
            onStart={() => start.mutate(c.position)}
          />
        ))}
      </motion.section>
    )

  return (
    <Screen>
      <header className="topbar">
        <IconButton label="Retour" onClick={() => nav('/library', { replace: true })}>
          {Icon.back}
        </IconButton>
      </header>
      <div className="scroll" style={{ padding: '0 20px 48px' }}>
        <motion.div variants={list} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <motion.div variants={item} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <SipIcon id={p.id} size={62} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#9c4a22', textTransform: 'uppercase', letterSpacing: '.06em' }}>Programme</span>
                <h1 style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.15 }}>{p.title}</h1>
              </div>
            </div>
            {p.summary && (
              <p className="muted" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>
                {p.summary}
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[`${p.chapters.length} chapitres`, duration(totalLessons), `${done}/${p.chapters.length} terminés`].map((t) => (
                <span key={t} className="chip" style={{ background: 'var(--surface)', color: 'var(--ink-soft)', boxShadow: '0 0 0 1px rgba(43,38,32,.06)' }}>
                  {t}
                </span>
              ))}
            </div>
          </motion.div>

          {err && (
            <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="well" style={{ borderRadius: 18, padding: '12px 14px', fontSize: 15, fontWeight: 800, color: 'var(--rose-ink)' }}>
              {err}
            </motion.p>
          )}

          {section(advanced.length ? 'Les bases' : 'Les chapitres', core)}
          {section('Pour aller plus loin', advanced)}
          <DeleteButton label="Supprimer ce programme" confirm="Supprimer ce programme et tous ses chapitres ? Ta progression sera perdue." busy={remove.isPending} onConfirm={() => remove.mutate()} />
        </motion.div>
      </div>
    </Screen>
  )
}

export function DeleteButton({ label, confirm, busy, onConfirm }: { label: string; confirm: string; busy: boolean; onConfirm: () => void }) {
  return (
    <button
      disabled={busy}
      onClick={() => window.confirm(confirm) && onConfirm()}
      style={{ alignSelf: 'center', border: 'none', background: 'none', height: 44, padding: '0 12px', fontSize: 14, fontWeight: 800, color: 'var(--rose-ink)' }}
    >
      {busy ? '…' : label}
    </button>
  )
}

function ChapterCard({
  chapter: c,
  state,
  last,
  starting,
  onOpen,
  onStart,
}: {
  chapter: Chapter
  state: ChapterState
  last: boolean
  starting: boolean
  onOpen: () => void
  onStart: () => void
}) {
  const s = c.sip
  const tappable = !!s
  const badge =
    state === 'done'
      ? { bg: 'var(--mint)', fg: 'var(--mint-ink)', lip: 'var(--mint-lip)' }
      : state === 'current' || state === 'building'
        ? { bg: 'var(--peach)', fg: 'var(--ink)', lip: 'var(--peach-lip)' }
        : state === 'next'
          ? { bg: 'var(--surface)', fg: 'var(--ink)', lip: 'rgba(43,38,32,.12)' }
          : { bg: 'var(--track)', fg: 'var(--muted)', lip: 'transparent' }
  return (
    <motion.div
      whileTap={tappable ? { scale: 0.98 } : undefined}
      onClick={() => {
        if (!tappable) return
        play('tap')
        onOpen()
      }}
      className={state === 'later' ? 'well' : 'card'}
      style={{ borderRadius: 24, padding: 14, display: 'flex', gap: 14, cursor: tappable ? 'pointer' : undefined, position: 'relative' }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          background: badge.bg,
          color: badge.fg,
          boxShadow: `0 3px 0 ${badge.lip}`,
          fontSize: 16,
          fontWeight: 900,
        }}
      >
        {state === 'done' ? Icon.check(16, '#2F7A52') : last && state === 'later' ? '★' : c.position}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.25, color: state === 'later' ? 'var(--ink-soft)' : 'var(--ink)' }}>{c.title}</span>
        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: 'var(--muted)' }}>{c.outcome}</span>
        {s && state !== 'building' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--track)' }}>
              <div style={{ width: `${(s.progress.completed / Math.max(1, s.progress.total)) * 100}%`, height: '100%', borderRadius: 3, background: state === 'done' ? 'var(--mint-strong)' : 'var(--peach)' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--muted)' }}>
              {s.progress.completed}/{s.progress.total}
            </span>
          </div>
        ) : state === 'building' ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--peach-ink)' }}>{s?.status === 'failed' ? 'Raté, touche pour réessayer' : 'En préparation…'}</span>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)' }}>
            {c.estimated_lessons} leçons · {duration(c.estimated_lessons)}
          </span>
        )}
        {state === 'next' && (
          <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
            <Button onClick={onStart} disabled={starting} sound="pop" style={{ height: 50, fontSize: 16 }}>
              {starting ? <Mascot mood="think" size={30} /> : 'Préparer ce chapitre'}
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
