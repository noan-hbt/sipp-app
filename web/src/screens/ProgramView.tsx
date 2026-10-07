import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { itemVariants as item, listVariants as list } from '../components/SipCard'
import { SipIcon, sipPalette } from '../components/SipIcon'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, ApiError, type Chapter, type Program } from '../lib/api'
import { duration } from '../lib/format'
import { play } from '../lib/sound'

const ERRORS: Record<string, string> = {
  program_adjusting: 'J’ajuste encore la suite de ton programme, réessaie dans un instant.',
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
      q.state.data?.status === 'generating' || q.state.data?.status === 'adjusting' || q.state.data?.chapters.some((c) => c.sip && c.sip.status !== 'ready' && c.sip.status !== 'failed') ? 2500 : false,
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

  if (!p || (p.status !== 'ready' && p.status !== 'adjusting')) {
    return (
      <Screen>
        <header className="topbar">
          <IconButton label="Retour" onClick={() => nav(-1)}>
            {Icon.back}
          </IconButton>
        </header>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 32px 80px', textAlign: 'center' }}>
          <div style={{ width: 150, height: 150, borderRadius: 75, display: 'grid', placeItems: 'center', background: 'var(--peach-soft)' }}>
            <Mascot mood={p?.status === 'failed' ? 'oops' : 'think'} size={104} />
          </div>
          <h1 className="title-l">{p?.status === 'failed' ? 'La suite m’a résisté' : p ? 'Je dessine la suite…' : ''}</h1>
          {p?.status === 'generating' && (
            <p className="muted" style={{ fontSize: 15 }}>
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
      <motion.section variants={item} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="display" style={{ fontSize: 18, margin: '6px 6px 0' }}>
          {title}
        </span>
        {chapters.map((c) => (
          <ChapterCard
            key={c.position}
            chapter={c}
            state={chapterState(c, next)}
            last={c.position === p.chapters.length}
            starting={start.isPending && start.variables === c.position}
            adjusting={p.status === 'adjusting'}
            onOpen={() => c.sip && nav(c.sip.status === 'ready' ? `/sips/${c.sip.id}` : `/sips/${c.sip.id}/building`)}
            onStart={() => start.mutate(c.position)}
          />
        ))}
      </motion.section>
    )

  const current = p.chapters.find((c) => chapterState(c, next) === 'current')
  const pal = sipPalette(p.title)
  return (
    <Screen>
      <div className="scroll" style={{ paddingBottom: 48 }}>
        <motion.div variants={list} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <motion.div variants={item} style={{ position: 'relative', borderRadius: '0 0 40px 40px', background: pal.bg, padding: 'calc(var(--safe-top) + 14px) 18px 22px', overflow: 'hidden' }}>
            <Confetti />
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between' }}>
              <IconButton label="Retour" onClick={() => nav('/library', { replace: true })}>
                {Icon.back}
              </IconButton>
            </div>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
              <motion.div initial={{ scale: 0.7, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
                <SipIcon text={p.title} size={140} radius={0} />
              </motion.div>
              <h1 className="display" style={{ fontSize: 26, lineHeight: 1.1 }}>
                {p.title}
              </h1>
              {p.summary && <p style={{ fontSize: 15, lineHeight: 1.45, color: pal.ink }}>{p.summary}</p>}
            </div>
          </motion.div>

          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <motion.div variants={item} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {[
                [`${done}/${p.chapters.length}`, 'chapitres faits', 'var(--butter)'],
                [String(p.chapters.length), 'chapitres', 'var(--peach-soft)'],
                [duration(totalLessons), 'au total', 'var(--mint)'],
              ].map(([v, l, bg]) => (
                <div key={l} style={{ borderRadius: 20, background: bg, padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="display" style={{ fontSize: 20 }}>
                    {v}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{l}</span>
                </div>
              ))}
            </motion.div>

            {current?.sip && (
              <motion.div variants={item}>
                <Button onClick={() => nav(`/sips/${current.sip!.id}`)}>Reprendre · chapitre {current.position}</Button>
              </motion.div>
            )}

            {p.status === 'adjusting' ? (
              <motion.div variants={item} style={{ borderRadius: 22, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)' }}>
                <Mascot mood="think" size={44} />
                <p style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>J’ajuste la suite de ton programme selon ce que tu viens d’apprendre…</p>
              </motion.div>
            ) : (
              p.note && (
                <motion.div variants={item} style={{ borderRadius: 22, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--lavender)' }}>
                  <Mascot mood="hello" size={44} />
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--lavender-ink)' }}>Programme ajusté</span>
                    <p style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4, color: 'var(--ink)' }}>{p.note}</p>
                  </div>
                </motion.div>
              )
            )}

            {err && (
              <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ borderRadius: 18, padding: '12px 14px', fontSize: 15, fontWeight: 600, color: 'var(--rose-ink)', background: 'var(--rose-soft)' }}>
                {err}
              </motion.p>
            )}

            {section(advanced.length ? 'Les bases' : 'Le parcours', core)}
            {section('Pour aller plus loin', advanced)}
            <DeleteButton label="Supprimer ce programme" confirm="Tous ses chapitres et ta progression seront perdus. Ça libère une place." busy={remove.isPending} onConfirm={() => remove.mutate()} />
          </div>
        </motion.div>
      </div>
    </Screen>
  )
}

/** Flat dots and stars scattered on colored headers. */
export function Confetti({ seed = 0 }: { seed?: number }) {
  const bits = [
    { x: '8%', y: '38%', s: 14, c: 'var(--sun)', k: 'dot' },
    { x: '86%', y: '30%', s: 20, c: 'var(--lavender-strong)', k: 'sq' },
    { x: '80%', y: '78%', s: 22, c: '#fff', k: 'star' },
    { x: '14%', y: '76%', s: 18, c: 'var(--coral)', k: 'star' },
    { x: '92%', y: '58%', s: 10, c: 'var(--mint-strong)', k: 'dot' },
  ]
  return (
    <>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          initial={{ scale: 0 }}
          animate={{ scale: 1, rotate: b.k === 'sq' ? 18 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 12, delay: 0.15 + ((i + seed) % 5) * 0.06 }}
          style={{ position: 'absolute', left: b.x, top: b.y, width: b.s, height: b.s, display: 'grid' }}
        >
          {b.k === 'star' ? (
            <svg width={b.s} height={b.s} viewBox="0 0 24 24">
              <path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" fill={b.c} />
            </svg>
          ) : (
            <span style={{ width: '100%', height: '100%', borderRadius: b.k === 'dot' ? '50%' : 5, background: b.c }} />
          )}
        </motion.span>
      ))}
    </>
  )
}

export function DeleteButton({ label, confirm, busy, onConfirm }: { label: string; confirm: string; busy: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        disabled={busy}
        onClick={() => setOpen(true)}
        style={{ alignSelf: 'center', border: 'none', background: 'none', height: 44, padding: '0 12px', fontSize: 14, fontWeight: 600, color: 'var(--rose-ink)' }}
      >
        {label}
      </button>
      <ConfirmSheet open={open} title={`${label} ?`} message={confirm} confirmLabel="Supprimer" busy={busy} onConfirm={onConfirm} onClose={() => setOpen(false)} />
    </>
  )
}

function ChapterCard({
  chapter: c,
  state,
  last,
  starting,
  adjusting,
  onOpen,
  onStart,
}: {
  chapter: Chapter
  state: ChapterState
  last: boolean
  starting: boolean
  adjusting: boolean
  onOpen: () => void
  onStart: () => void
}) {
  const s = c.sip
  const tappable = !!s
  const badge =
    state === 'done'
      ? { bg: 'var(--mint)', fg: 'var(--mint-ink)' }
      : state === 'current' || state === 'building'
        ? { bg: 'var(--primary)', fg: '#fff' }
        : state === 'next'
          ? { bg: 'var(--primary-soft)', fg: 'var(--primary-ink)' }
          : { bg: 'var(--bg-deep)', fg: 'var(--faint)' }
  return (
    <motion.div
      whileTap={tappable ? { scale: 0.98 } : undefined}
      onClick={() => {
        if (!tappable) return
        play('tap')
        onOpen()
      }}
      style={{
        borderRadius: 24,
        padding: 14,
        display: 'flex',
        gap: 14,
        cursor: tappable ? 'pointer' : undefined,
        position: 'relative',
        background: state === 'current' ? 'var(--primary-soft)' : state === 'later' ? 'transparent' : 'var(--surface)',
        boxShadow: state === 'later' ? 'inset 0 0 0 2px var(--line)' : 'none',
      }}
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
          fontFamily: 'var(--display)',
          fontSize: 16,
          fontWeight: 500,
        }}
      >
        {state === 'done' ? Icon.check(16, 'var(--mint-ink)') : last && state === 'later' ? '★' : c.position}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25, color: state === 'later' ? 'var(--muted)' : 'var(--ink)' }}>{c.title}</span>
        <span style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--muted)' }}>{c.outcome}</span>
        {s && state !== 'building' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--track)' }}>
              <div style={{ width: `${(s.progress.completed / Math.max(1, s.progress.total)) * 100}%`, height: '100%', borderRadius: 3, background: state === 'done' ? 'var(--mint-strong)' : 'var(--primary)' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              {s.progress.completed}/{s.progress.total}
            </span>
          </div>
        ) : state === 'building' ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-ink)' }}>{s?.status === 'failed' ? 'Raté, touche pour réessayer' : 'En préparation…'}</span>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--faint)' }}>
            {c.estimated_lessons} leçons · {duration(c.estimated_lessons)}
          </span>
        )}
        {state === 'next' && (
          <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
            <Button onClick={onStart} disabled={starting || adjusting} sound="pop" style={{ height: 50, fontSize: 16 }}>
              {starting || adjusting ? <Mascot mood="think" size={30} /> : 'Préparer ce chapitre'}
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
