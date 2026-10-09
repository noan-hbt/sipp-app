import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { itemVariants as item, listVariants as list } from '../components/SipCard'
import { illustration, SipIcon, sipPalette } from '../components/SipIcon'
import { Button, Icon } from '../components/ui'
import { Api, type SipSummary, type Stats } from '../lib/api'
import { play } from '../lib/sound'

function greeting() {
  const h = new Date().getHours()
  return h < 6 ? 'Encore debout ?' : h < 12 ? 'Bonjour' : h < 18 ? 'Salut' : 'Bonsoir'
}

const today = () => {
  const s = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const isDone = (s: SipSummary) => s.progress.total > 0 && s.progress.completed >= s.progress.total

export function Home() {
  const nav = useNavigate()
  const sips = useQuery({
    queryKey: ['sips'],
    queryFn: Api.sips,
    refetchInterval: (q) => (q.state.data?.some((s) => s.status === 'queued' || s.status === 'generating') ? 3000 : false),
  })
  const stats = useQuery({ queryKey: ['stats'], queryFn: Api.stats })
  const review = useQuery({ queryKey: ['review'], queryFn: Api.review })
  const plan = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  const roomForMore = !!plan.data && plan.data.slots_used < plan.data.slots && plan.data.sips_this_month < plan.data.sips_per_month
  const due = review.data?.due_count ?? 0
  const queries = [sips, stats, review]
  const offline = queries.some((q) => q.isPaused)
  const failed = queries.some((q) => q.isError)

  const all = sips.data ?? []
  const resume = all.find((s) => s.status === 'ready' && s.progress.completed < s.progress.total)
  // Nothing to resume yet but a Sip on its way: that is the news, not "all done".
  const building = resume ? undefined : all.find((s) => s.status === 'queued' || s.status === 'generating')
  const finishedAll = all.some((s) => s.status === 'ready' && s.progress.completed > 0)
  // The topics grid: in progress or being built first, then finished ones.
  const rest = all.filter((s) => s !== resume && s !== building)
  const topics = [...rest.filter((s) => !isDone(s)), ...rest.filter(isDone)].slice(0, 4)
  const open = (s: SipSummary) => nav(s.status === 'ready' ? `/sips/${s.id}` : `/sips/${s.id}/building`)

  return (
    <Screen>
      <header className="topbar" style={{ padding: 'calc(var(--safe-top) + 18px) 20px 4px', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--faint)' }}>{today()}</span>
          <h1 className="display" style={{ fontSize: 30, lineHeight: 1.05 }}>
            {greeting()}
          </h1>
        </div>
        <motion.button
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.2 }}
          onClick={() => nav('/progress')}
          className="display"
          style={{ height: 42, padding: '0 14px', border: 'none', borderRadius: 21, display: 'flex', alignItems: 'center', gap: 6, fontSize: 17, background: 'var(--primary-soft)', color: 'var(--primary-ink)' }}
          aria-label={stats.data ? `Série de ${stats.data.streak_days} jours, voir mes progrès` : 'Voir mes progrès'}
        >
          <motion.span
            animate={stats.data?.completed_today ? { scale: [1, 1.18, 1], rotate: [0, -6, 6, 0] } : { opacity: 0.45 }}
            transition={{ duration: 1.6, repeat: stats.data?.completed_today ? Infinity : 0, repeatDelay: 1.2 }}
            style={{ display: 'grid', filter: stats.data?.completed_today ? 'none' : 'grayscale(1)' }}
          >
            {Icon.flame}
          </motion.span>
          {stats.data?.streak_days ?? '—'}
        </motion.button>
      </header>

      <div className="scroll" style={{ padding: '14px 16px 130px' }}>
        {(offline || failed) && <ErrorNotice message={offline ? 'Tu es hors ligne. Reconnecte-toi pour actualiser ton accueil.' : 'Impossible d’actualiser ton accueil. Réessaie.'} retry={() => { queries.forEach((q) => { void q.refetch() }) }} busy={queries.some((q) => q.isFetching)} />}
        {stats.data && <Week week={stats.data.week} frozen={stats.data.freeze_used} />}
        {stats.data && <Recap stats={stats.data} />}
        {stats.data && !stats.data.completed_today && <FrozeYesterday stats={stats.data} />}
        {stats.data && goalOf(stats.data) > 1 && (stats.data.lessons_today ?? 0) > 0 && (stats.data.lessons_today ?? 0) < goalOf(stats.data) ? (
          <GoalBar done={stats.data.lessons_today ?? 0} goal={goalOf(stats.data)} />
        ) : stats.data?.completed_today && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            role="status"
            style={{ marginTop: 12, padding: '10px 14px', borderRadius: 16, background: 'var(--mint)', color: 'var(--mint-ink)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {Icon.check(16, 'var(--mint-ink)')}
            {goalOf(stats.data) > 1
              ? `Objectif du jour atteint · ${stats.data.lessons_today} leçons`
              : stats.data.streak_days > 1
              ? `Leçon du jour faite · ${stats.data.streak_days} jours d’affilée`
              : 'Leçon du jour faite, ta série est lancée. À demain !'}
          </motion.p>
        )}
        {sips.isLoading ? (
          <Skeleton />
        ) : !sips.data ? null : all.length === 0 ? (
          <Empty onStart={() => nav('/new')} />
        ) : (
          <motion.div variants={list} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
            {resume ? (
              <Hero sip={resume} onGo={() => nav(`/sips/${resume.id}`)} />
            ) : building ? (
              <BuildingCard sip={building} onGo={() => nav(`/sips/${building.id}/building`)} />
            ) : (
              <NewCard done={finishedAll} onGo={() => nav('/new')} />
            )}
            {due > 0 && <ReviewCard due={due} onGo={() => nav('/review')} />}
            {resume && topics.length === 0 && roomForMore && (
              <motion.button
                variants={item}
                whileTap={{ scale: 0.97 }}
                onClick={() => nav('/new')}
                style={{ border: '2px dashed var(--line-strong)', background: 'transparent', borderRadius: 24, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
              >
                <span style={{ width: 40, height: 40, borderRadius: 14, background: 'var(--peach-soft)', color: 'var(--primary)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{Icon.plus}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>Un autre sujet en tête ?</span>
                  <span style={{ fontSize: 14, color: 'var(--muted)' }}>Lance un deuxième Sip en parallèle.</span>
                </span>
              </motion.button>
            )}

            {topics.length > 0 && (
              <motion.div variants={item} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '12px 6px 0' }}>
                <h3 className="display" style={{ fontSize: 20 }}>
                  Tes sujets
                </h3>
                <button onClick={() => nav('/library', { replace: true })} style={{ border: 'none', background: 'none', fontSize: 15, fontWeight: 600, color: 'var(--primary)' }}>
                  Tout voir
                </button>
              </motion.div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {topics.map((s) => (
                <TopicTile key={s.id} sip={s} onOpen={() => open(s)} />
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </Screen>
  )
}

const goalOf = (s: Stats) => s.daily_goal ?? 1

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** This week's Monday, local time. */
function monday() {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** Several lessons a day: how far along today's goal is. */
function GoalBar({ done, goal }: { done: number; goal: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} role="status" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 16, background: 'var(--primary-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary-ink)' }}>
        Objectif du jour · {done} leçon{done > 1 ? 's' : ''} sur {goal}
      </span>
      <span style={{ display: 'grid', gridTemplateColumns: `repeat(${goal}, minmax(0, 1fr))`, gap: 4 }}>
        {Array.from({ length: goal }, (_, i) => (
          <span key={i} style={{ height: 6, borderRadius: 3, background: i < done ? 'var(--primary)' : 'var(--surface)' }} />
        ))}
      </span>
    </motion.div>
  )
}

/** Yesterday was missed but the weekly freeze kept the streak alive: say it, today. */
function FrozeYesterday({ stats }: { stats: Stats }) {
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (!stats.freeze_used?.includes(iso(y)) || !stats.streak_days) return null
  return (
    <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} role="status" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 16, background: 'var(--sky)', color: 'var(--sky-ink)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.35 }}>
      {Icon.snow(16)}
      Hier, ta série a été protégée. Une leçon aujourd’hui pour la garder.
    </motion.p>
  )
}

const RECAP_KEY = 'sipp.recap-seen'

/** Monday to Wednesday: how last week went, until dismissed. */
function Recap({ stats }: { stats: Stats }) {
  const week = iso(monday())
  const [seen, setSeen] = useState(() => {
    try { return localStorage.getItem(RECAP_KEY) === week } catch { return false }
  })
  const w = stats.last_week
  const day = (new Date().getDay() + 6) % 7
  if (seen || !w || w.lessons === 0 || day > 2) return null
  const close = () => {
    setSeen(true)
    try { localStorage.setItem(RECAP_KEY, week) } catch { /* private mode */ }
  }
  const cells: [number, string][] = [
    [w.lessons, w.lessons > 1 ? 'leçons' : 'leçon'],
    [w.minutes, 'minutes'],
    [w.notions, w.notions > 1 ? 'notions' : 'notion'],
    [w.active_days, w.active_days > 1 ? 'jours actifs' : 'jour actif'],
  ]
  return (
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 12, padding: 14, borderRadius: 22, background: 'var(--lavender)', display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Ta semaine dernière">
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="display" style={{ fontSize: 17, color: 'var(--lavender-ink)' }}>Ta semaine dernière</span>
        <button onClick={close} aria-label="Masquer" style={{ border: 'none', background: 'none', color: 'var(--lavender-ink)', display: 'grid', padding: 4 }}>{Icon.cross(16)}</button>
      </span>
      <span style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
        {cells.map(([n, label]) => (
          <span key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--surface)', borderRadius: 14, padding: '8px 2px' }}>
            <span className="display" style={{ fontSize: 20 }}>{n}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
          </span>
        ))}
      </span>
      <span style={{ fontSize: 14, color: 'var(--lavender-ink)', lineHeight: 1.4 }}>
        {w.active_days >= 5 ? 'Une semaine solide. On garde ce rythme ?' : w.active_days >= 3 ? 'Beau rythme. Un jour de plus cette semaine ?' : 'Chaque leçon compte. On vise un jour de plus cette semaine ?'}
      </span>
    </motion.section>
  )
}

/** Monday → Sunday: filled when a lesson was done that day, a snowflake when the freeze saved it, ring on today. */
function Week({ week, frozen }: { week?: boolean[]; frozen?: string[] }) {
  const todayIdx = (new Date().getDay() + 6) % 7
  const start = new Date(`${iso(monday())}T12:00:00`).getTime()
  const frozenIdx = new Set((frozen ?? []).map((f) => Math.round((new Date(`${f}T12:00:00`).getTime() - start) / 86400000)))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', padding: '0 4px' }}>
      {'LMMJVSD'.split('').map((l, i) => {
        const done = week?.[i] ?? false
        const isToday = i === todayIdx
        const saved = !done && frozenIdx.has(i)
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <motion.span
              initial={done ? { scale: 0.4 } : false}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 14, delay: 0.1 + i * 0.04 }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                display: 'grid',
                placeItems: 'center',
                background: done ? 'var(--primary)' : saved ? 'var(--sky)' : 'var(--surface)',
                boxShadow: done || saved ? 'none' : isToday ? 'inset 0 0 0 2.5px var(--primary)' : 'inset 0 0 0 2px var(--line)',
              }}
              aria-label={saved ? 'Série protégée' : undefined}
            >
              {done ? Icon.check(14, '#fff') : saved ? Icon.snow(15) : null}
            </motion.span>
            <span style={{ fontSize: 12, fontWeight: 600, color: isToday ? 'var(--ink)' : 'var(--faint)' }}>{l}</span>
          </div>
        )
      })}
    </div>
  )
}

function Hero({ sip, onGo }: { sip: SipSummary; onGo: () => void }) {
  return (
    <motion.section
      variants={item}
      style={{ borderRadius: 30, padding: 20, background: 'var(--primary)', color: '#fff', position: 'relative', overflow: 'hidden' }}
    >
      <span style={{ position: 'absolute', right: -30, top: -30, width: 150, height: 150, borderRadius: 75, background: 'rgba(255,255,255,.1)' }} />
      <motion.div
        style={{ position: 'absolute', right: 10, top: 30 }}
        animate={{ rotate: [0, -4, 0, 4, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Mascot size={104} />
      </motion.div>
      <div style={{ position: 'relative', maxWidth: '62%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="pill-tag" style={{ background: 'rgba(255,255,255,.2)' }}>
          {sip.chapter ? `Chapitre ${sip.chapter}` : sip.progress.completed ? 'On reprend' : 'On commence'} · {sip.progress.completed + 1} sur {sip.progress.total}
        </span>
        <h2 className="display" style={{ fontSize: 23, lineHeight: 1.12 }}>
          {sip.next_lesson_title ?? sip.title}
        </h2>
        {sip.next_lesson_title && <span style={{ fontSize: 14, color: 'rgba(255,255,255,.82)' }}>{sip.title}</span>}
      </div>
      <div style={{ position: 'relative', marginTop: 16, height: 8, borderRadius: 4, background: 'rgba(255,255,255,.22)', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(sip.progress.completed / Math.max(1, sip.progress.total)) * 100}%` }}
          transition={{ type: 'spring', stiffness: 80, damping: 18, delay: 0.3 }}
          style={{ height: '100%', borderRadius: 4, background: '#fff' }}
        />
      </div>
      <Button variant="soft" onClick={onGo} style={{ position: 'relative', marginTop: 14, boxShadow: 'none' }}>
        {sip.progress.completed > 0 ? 'Reprendre' : 'Commencer'} · 5 min
      </Button>
    </motion.section>
  )
}

function ReviewCard({ due, onGo }: { due: number; onGo: () => void }) {
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        play('pop')
        onGo()
      }}
      style={{ border: 'none', textAlign: 'left', borderRadius: 24, padding: '12px 14px', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12 }}
    >
      <span style={{ width: 48, height: 48, borderRadius: 16, background: 'var(--butter)', color: 'var(--butter-ink)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
        </svg>
      </span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Révision du jour</span>
        <span style={{ fontSize: 14, color: 'var(--muted)' }}>
          {due} notion{due > 1 ? 's' : ''} à rafraîchir · 2 min
        </span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </motion.button>
  )
}

function BuildingCard({ sip, onGo }: { sip: SipSummary; onGo: () => void }) {
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.97 }}
      onClick={onGo}
      style={{ border: 'none', textAlign: 'left', borderRadius: 30, padding: 20, background: 'var(--lavender)', display: 'flex', alignItems: 'center', gap: 14 }}
    >
      <Mascot mood="think" size={72} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span className="display" style={{ fontSize: 20 }}>
          Ton Sip se prépare…
        </span>
        <span style={{ fontSize: 15, color: 'var(--lavender-ink)', overflowWrap: 'anywhere' }}>{sip.title ?? sip.input_text}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Une minute environ. Touche pour suivre.</span>
      </div>
    </motion.button>
  )
}

function NewCard({ done, onGo }: { done: boolean; onGo: () => void }) {
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.97 }}
      onClick={onGo}
      style={{ border: 'none', textAlign: 'left', borderRadius: 30, padding: 20, background: 'var(--peach-soft)', display: 'flex', alignItems: 'center', gap: 14 }}
    >
      <Mascot size={72} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="display" style={{ fontSize: 20 }}>
          {done ? 'Tout est bouclé !' : 'Ton prochain sujet ?'}
        </span>
        <span style={{ fontSize: 15, color: 'var(--primary-ink)' }}>{done ? 'Qu’est-ce qu’on apprend ensuite ?' : 'Dis-moi ce qui te fait envie.'}</span>
      </div>
    </motion.button>
  )
}

function TopicTile({ sip, onOpen }: { sip: SipSummary; onOpen: () => void }) {
  const building = sip.status === 'queued' || sip.status === 'generating'
  const failed = sip.status === 'failed'
  const name = sip.title ?? sip.input_text
  const pal = sipPalette(name)
  const meta = building
    ? 'Je prépare…'
    : failed
      ? 'Raté, touche pour réessayer'
      : isDone(sip)
        ? 'Terminé'
        : sip.chapter
          ? `Chapitre ${sip.chapter} · ${sip.progress.completed}/${sip.progress.total}`
          : `${sip.progress.completed} / ${sip.progress.total} leçons`
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.96 }}
      onClick={() => {
        play('tap')
        onOpen()
      }}
      style={{
        border: 'none',
        textAlign: 'left',
        borderRadius: 24,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: failed ? 'var(--rose-soft)' : building ? 'var(--surface)' : pal.bg,
      }}
    >
      {building ? <Mascot mood="think" size={60} /> : failed ? <Mascot mood="oops" size={60} /> : <SipIcon text={name} size={64} radius={0} />}
      <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{name}</span>
      <span style={{ fontSize: 13, color: failed ? 'var(--rose-ink)' : 'var(--muted)' }}>{meta}</span>
    </motion.button>
  )
}

function Empty({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center', paddingTop: 28 }}
    >
      <div style={{ width: 230, height: 230, borderRadius: 115, background: 'var(--peach-soft)', display: 'grid', placeItems: 'center' }}>
        <img src={illustration('scene-welcome')} alt="" width={200} height={200} />
      </div>
      <h2 className="title-l">Qu’est-ce qu’on apprend ?</h2>
      <p className="muted" style={{ fontSize: 16, maxWidth: 290, lineHeight: 1.45 }}>
        N’importe quel sujet. Je construis le parcours, tu avances cinq minutes à la fois.
      </p>
      <div style={{ width: '100%', maxWidth: 300, marginTop: 6 }}>
        <Button onClick={onStart}>Mon premier Sip</Button>
      </div>
    </motion.div>
  )
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
      {[230, 150].map((h, i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
          style={{ height: h, borderRadius: 30, background: 'var(--bg-deep)' }}
        />
      ))}
    </div>
  )
}
