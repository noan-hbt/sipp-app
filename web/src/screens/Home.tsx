import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { Mascot } from '../components/Mascot'
import { CountUp, LiquidBar, RevealLines, Ring } from '../components/motion'
import { Screen } from '../components/Screen'
import { itemVariants as item, listVariants as list, SipTile } from '../components/SipCard'
import { illustration, topicArt } from '../components/SipIcon'
import { Button, Icon } from '../components/ui'
import { Api, type SipSummary, type Stats } from '../lib/api'
import { LESSON_MINUTES } from '../lib/format'
import { play } from '../lib/sound'

const today = () => {
  const s = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const goalOf = (s: Stats) => s.daily_goal ?? 1

/** Two lines, the second in caramel: what today is about. */
function headline(s: Stats | undefined): [string, string] {
  if (s) {
    const n = s.lessons_today ?? (s.completed_today ? 1 : 0)
    if (n >= goalOf(s) && n > 0) return goalOf(s) > 1 ? ['Objectif atteint,', 'à demain !'] : ['Gorgée bue,', 'bien joué.']
    if (n > 0) return ['Encore une', 'gorgée ?']
  }
  const h = new Date().getHours()
  return h < 6 ? ['Encore debout ?', 'Une petite.'] : h < 12 ? ['Bonjour,', 'une gorgée ?'] : h < 18 ? ['Une gorgée,', 'et c’est parti.'] : ['Bonsoir,', 'une dernière ?']
}

const isDone = (s: SipSummary) => s.progress.total > 0 && s.progress.completed >= s.progress.total

/** Today as a bento: the next lesson, the streak, today's goal, reviews, then the topics. */
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
  const s = stats.data

  const all = sips.data ?? []
  const resume = all.find((x) => x.status === 'ready' && x.progress.completed < x.progress.total)
  // Nothing to resume yet but a Sip on its way: that is the news, not "all done".
  const building = resume ? undefined : all.find((x) => x.status === 'queued' || x.status === 'generating')
  const finishedAll = all.some((x) => x.status === 'ready' && x.progress.completed > 0)
  // The topics: in progress or being built first, then finished ones.
  const rest = all.filter((x) => x !== resume && x !== building)
  const topics = [...rest.filter((x) => !isDone(x)), ...rest.filter(isDone)].slice(0, 4)
  const open = (x: SipSummary) => nav(x.status === 'ready' ? `/sips/${x.id}` : `/sips/${x.id}/building`)
  const [l1, l2] = headline(s)

  return (
    <Screen kind="fade">
      <div className="scroll" style={{ padding: 'calc(var(--safe-top) + 20px) 16px 130px' }}>
        <header style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: 14, fontWeight: 600, color: 'var(--faint)' }}>
            {today()}
          </motion.span>
          <h1 key={l1} className="display" style={{ fontSize: 42, lineHeight: 0.98, letterSpacing: '-0.045em' }}>
            <RevealLines lines={[{ text: l1 }, { text: l2, color: 'var(--primary)' }]} delay={0.05} />
          </h1>
        </header>

        {s && <Week week={s.week} frozen={s.freeze_used} />}

        {(offline || failed) && (
          <div style={{ marginTop: 12 }}>
            <ErrorNotice message={offline ? 'Tu es hors ligne. Reconnecte-toi pour actualiser ton accueil.' : 'Impossible d’actualiser ton accueil. Réessaie.'} retry={() => { queries.forEach((q) => { void q.refetch() }) }} busy={queries.some((q) => q.isFetching)} />
          </div>
        )}
        {s && <Recap stats={s} />}
        {s && !s.completed_today && <FrozeYesterday stats={s} />}

        {sips.isLoading ? (
          <Skeleton />
        ) : !sips.data ? null : all.length === 0 ? (
          <Empty onStart={() => nav('/new')} />
        ) : (
          <motion.div variants={list} initial="hidden" animate="show" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
            {resume ? (
              <NextTile sip={resume} onGo={() => nav(`/sips/${resume.id}`)} />
            ) : building ? (
              <BuildingTile sip={building} onGo={() => nav(`/sips/${building.id}/building`)} />
            ) : (
              <NewTile done={finishedAll} onGo={() => nav('/new')} />
            )}
            {s && <StreakTile stats={s} onGo={() => nav('/progress')} />}
            {s && <GoalTile stats={s} onGo={() => nav('/profile')} />}
            {due > 0 && <ReviewTile due={due} onGo={() => nav('/review')} />}
            {resume && topics.length === 0 && roomForMore && (
              <motion.button
                variants={item}
                whileTap={{ scale: 0.97 }}
                onClick={() => nav('/new')}
                style={{ gridColumn: '1 / -1', border: '2px dashed var(--line-strong)', background: 'transparent', borderRadius: 26, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
              >
                <span style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{Icon.plus}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>Un autre sujet en tête ?</span>
                  <span style={{ fontSize: 14, color: 'var(--muted)' }}>Lance un deuxième Sip en parallèle.</span>
                </span>
              </motion.button>
            )}

            {topics.length > 0 && (
              <motion.div variants={item} style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '14px 6px 4px' }}>
                <h2 className="display" style={{ fontSize: 22 }}>
                  Tes sujets
                </h2>
                <button onClick={() => nav('/library', { replace: true })} style={{ border: 'none', background: 'none', fontSize: 15, fontWeight: 700, color: 'var(--primary)', padding: '6px 0' }}>
                  Tout voir
                </button>
              </motion.div>
            )}
            {topics.map((x, i) => (
              <SipTile key={x.id} sip={x} index={i} onOpen={() => open(x)} />
            ))}
          </motion.div>
        )}
      </div>
    </Screen>
  )
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** This week's Monday, local time. */
function monday() {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** Yesterday was missed but the weekly freeze kept the streak alive: say it, today. */
function FrozeYesterday({ stats }: { stats: Stats }) {
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (!stats.freeze_used?.includes(iso(y)) || !stats.streak_days) return null
  return (
    <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} role="status" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 18, background: 'var(--sky)', color: 'var(--sky-ink)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.35 }}>
      <img src={illustration('scene-freeze')} alt="" width={36} height={36} style={{ margin: '-6px 0', flexShrink: 0 }} />
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
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 12, padding: 14, borderRadius: 24, background: 'var(--lavender)', display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Ta semaine dernière">
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={illustration('scene-recap')} alt="" width={40} height={40} style={{ margin: '-6px 0' }} />
          <span className="display" style={{ fontSize: 17, color: 'var(--lavender-ink)' }}>Ta semaine dernière</span>
        </span>
        <button onClick={close} aria-label="Masquer" style={{ border: 'none', background: 'none', color: 'var(--lavender-ink)', display: 'grid', padding: 10, margin: -10 }}>{Icon.cross(16)}</button>
      </span>
      <span style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
        {cells.map(([n, label], i) => (
          <span key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--surface)', borderRadius: 14, padding: '8px 2px' }}>
            <span className="display" style={{ fontSize: 20 }}><CountUp value={n} delay={0.2 + i * 0.08} /></span>
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

/** Monday → Sunday as day tiles: caramel when a lesson was done, sky when the freeze saved it, dark for today. */
function Week({ week, frozen }: { week?: boolean[]; frozen?: string[] }) {
  const todayIdx = (new Date().getDay() + 6) % 7
  const mon = monday()
  const start = new Date(`${iso(mon)}T12:00:00`).getTime()
  const frozenIdx = new Set((frozen ?? []).map((f) => Math.round((new Date(`${f}T12:00:00`).getTime() - start) / 86400000)))
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginTop: 16 }}>
      {'LMMJVSD'.split('').map((l, i) => {
        const d = new Date(mon)
        d.setDate(mon.getDate() + i)
        const done = week?.[i] ?? false
        const isToday = i === todayIdx
        const saved = !done && frozenIdx.has(i)
        const future = i > todayIdx
        const bg = done ? 'var(--primary)' : saved ? 'var(--sky)' : isToday ? 'var(--ink)' : 'var(--surface)'
        const fg = done ? '#fff' : saved ? 'var(--sky-ink)' : isToday ? 'var(--on-ink)' : future ? 'var(--faint)' : 'var(--muted)'
        return (
          <motion.span
            key={i}
            initial={reduce ? false : { scale: 0.5, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 460, damping: 18, delay: 0.15 + i * 0.045 }}
            aria-label={`${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })}${done ? ', leçon faite' : saved ? ', série protégée' : ''}`}
            style={{
              height: 54,
              borderRadius: 18,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              background: bg,
              color: fg,
              boxShadow: isToday ? '0 0 0 3px var(--bg), 0 0 0 5px var(--ink)' : 'none',
              fontSize: 12,
              fontWeight: 600,
              opacity: future ? 0.75 : 1,
            }}
          >
            <span aria-hidden="true">{l}</span>
            <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', height: 18, fontSize: 16, fontWeight: 800, fontFamily: 'var(--display)' }}>
              {saved ? Icon.snow(15) : d.getDate()}
            </span>
          </motion.span>
        )
      })}
    </div>
  )
}

/** The next lesson: dark tile, caramel sun, the topic illustration floating in it. */
function NextTile({ sip, onGo }: { sip: SipSummary; onGo: () => void }) {
  const ratio = sip.progress.completed / Math.max(1, sip.progress.total)
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.975 }}
      onClick={() => {
        play('pop')
        onGo()
      }}
      style={{ gridColumn: '1 / -1', position: 'relative', overflow: 'hidden', border: 'none', textAlign: 'left', borderRadius: 30, padding: 20, minHeight: 214, background: 'var(--dock)', color: 'var(--dock-ink)', boxShadow: 'inset 0 0 0 1px var(--dock-line)', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <motion.span
        aria-hidden="true"
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.2 }}
        style={{ position: 'absolute', right: -48, bottom: -70, width: 230, height: 230, borderRadius: 115, background: 'var(--primary)' }}
      />
      <motion.span
        aria-hidden="true"
        initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 13, delay: 0.35 }}
        style={{ position: 'absolute', right: 0, bottom: 10 }}
      >
        <img src={topicArt(sip.title ?? sip.input_text)} alt="" width={148} height={148} draggable={false} style={{ display: 'block' }} />
      </motion.span>
      <span className="kicker" style={{ position: 'relative', color: 'var(--sun)' }}>
        {sip.progress.completed ? 'À suivre' : 'On commence'} · {LESSON_MINUTES} min
      </span>
      <span className="display" style={{ position: 'relative', maxWidth: '62%', fontSize: 25, lineHeight: 1.04, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {sip.next_lesson_title ?? sip.title}
      </span>
      {sip.next_lesson_title && <span style={{ position: 'relative', maxWidth: '58%', fontSize: 14, color: 'var(--dock-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sip.title}</span>}
      <span style={{ position: 'relative', marginTop: 'auto', paddingTop: 8, display: 'flex', alignItems: 'center', gap: 10, maxWidth: '62%' }}>
        <span style={{ height: 46, padding: '0 18px 0 14px', borderRadius: 23, background: '#fff', color: '#1d1a17', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4.5v15l13-7.5z" fill="#1d1a17" />
          </svg>
          {sip.progress.completed > 0 ? 'Continuer' : 'Commencer'}
        </span>
      </span>
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, maxWidth: '54%', fontSize: 13, fontWeight: 600, color: 'var(--dock-ink)' }}>
        <LiquidBar value={ratio} height={6} track="rgba(255,255,255,.14)" color="var(--sun)" delay={0.5} label="Avancement du Sip" />
        {sip.progress.completed}/{sip.progress.total}
      </span>
    </motion.button>
  )
}

function StreakTile({ stats, onGo }: { stats: Stats; onGo: () => void }) {
  const n = stats.streak_days
  const lit = stats.completed_today
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.96 }}
      onClick={onGo}
      aria-label={`Série de ${n} jour${n > 1 ? 's' : ''}, voir mes progrès`}
      style={{ position: 'relative', border: 'none', textAlign: 'left', borderRadius: 30, padding: 16, height: 172, background: 'var(--butter)', color: 'var(--butter-ink)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, fontWeight: 700 }}>
        Série
        <motion.span
          animate={lit ? { scale: [1, 1.2, 1], rotate: [0, -8, 8, 0] } : { opacity: 0.5 }}
          transition={{ duration: 0.9, delay: 0.6 }}
          style={{ display: 'grid', filter: lit ? 'none' : 'grayscale(1)' }}
        >
          {Icon.flame}
        </motion.span>
      </span>
      <span className="hero-num" style={{ fontSize: n > 99 ? 58 : 76, color: 'var(--ink)' }}>
        <CountUp value={n} delay={0.3} duration={1.1} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>
        {n === 0 ? 'Une leçon lance ta série' : `jour${n > 1 ? 's' : ''} d’affilée${lit ? '' : ' · à garder'}`}
      </span>
    </motion.button>
  )
}

function GoalTile({ stats, onGo }: { stats: Stats; onGo: () => void }) {
  const goal = goalOf(stats)
  const done = Math.min(stats.lessons_today ?? (stats.completed_today ? 1 : 0), goal)
  const reached = done >= goal
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.96 }}
      onClick={onGo}
      aria-label={`Objectif du jour : ${done} leçon${done > 1 ? 's' : ''} sur ${goal}. Modifier l’objectif`}
      style={{ position: 'relative', overflow: 'hidden', border: 'none', textAlign: 'left', borderRadius: 30, padding: 16, height: 172, background: 'var(--mint)', color: 'var(--mint-ink)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <span style={{ fontSize: 14, fontWeight: 700 }}>Objectif</span>
      <span style={{ position: 'absolute', right: 12, top: 38 }}>
        <Ring value={done / goal} size={78} stroke={11} color="var(--mint-lip)" track="var(--frost)" delay={0.4} />
        {reached && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 1 }}
            style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--mint-lip)' }}
          >
            {Icon.check(26)}
          </motion.span>
        )}
      </span>
      <span className="hero-num" style={{ fontSize: 40, color: 'var(--ink)' }}>
        {done}/{goal}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{reached ? 'Objectif atteint' : `leçon${goal > 1 ? 's' : ''} aujourd’hui`}</span>
    </motion.button>
  )
}

/** Notions to refresh: a little fan of cards that opens when it lands. */
function ReviewTile({ due, onGo }: { due: number; onGo: () => void }) {
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        play('pop')
        onGo()
      }}
      style={{ gridColumn: '1 / -1', border: 'none', textAlign: 'left', borderRadius: 26, padding: '0 14px 0 18px', height: 84, background: 'var(--lavender)', color: 'var(--lavender-ink)', display: 'flex', alignItems: 'center', gap: 12 }}
    >
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
          {due} notion{due > 1 ? 's' : ''} à réviser
        </span>
        <span style={{ fontSize: 14 }}>2 minutes pour les ancrer</span>
      </span>
      <span aria-hidden="true" style={{ position: 'relative', width: 78, height: 50 }}>
        {[
          ['var(--surface)', -10, 0],
          ['var(--lavender-strong)', 2, 20],
          ['var(--lavender-ink)', 13, 40],
        ].map(([bg, r, x], i) => (
          <motion.span
            key={i}
            initial={{ rotate: 0, x: 20 }}
            animate={{ rotate: r as number, x: x as number }}
            transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.5 + i * 0.08 }}
            style={{ position: 'absolute', top: 3, left: 0, width: 34, height: 44, borderRadius: 10, background: bg as string, boxShadow: '0 0 0 2px var(--lavender)' }}
          />
        ))}
      </span>
    </motion.button>
  )
}

function BuildingTile({ sip, onGo }: { sip: SipSummary; onGo: () => void }) {
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.97 }}
      onClick={onGo}
      style={{ gridColumn: '1 / -1', border: 'none', textAlign: 'left', borderRadius: 30, padding: 20, background: 'var(--lavender)', display: 'flex', alignItems: 'center', gap: 14 }}
    >
      <Mascot mood="think" size={76} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span className="display" style={{ fontSize: 21 }}>
          Ton Sip se prépare…
        </span>
        <span style={{ fontSize: 15, color: 'var(--lavender-ink)', overflowWrap: 'anywhere' }}>{sip.title ?? sip.input_text}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Une minute environ. Touche pour suivre.</span>
      </div>
    </motion.button>
  )
}

function NewTile({ done, onGo }: { done: boolean; onGo: () => void }) {
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.97 }}
      onClick={onGo}
      style={{ gridColumn: '1 / -1', position: 'relative', overflow: 'hidden', border: 'none', textAlign: 'left', borderRadius: 30, padding: 20, minHeight: 150, background: 'var(--primary)', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}
    >
      <img src={illustration('scene-welcome')} alt="" width={130} height={130} style={{ position: 'absolute', right: -4, bottom: -8 }} />
      <span className="display" style={{ position: 'relative', fontSize: 25, lineHeight: 1.04, maxWidth: '60%' }}>
        {done ? 'Tout est bouclé !' : 'Ton prochain sujet ?'}
      </span>
      <span style={{ position: 'relative', alignSelf: 'flex-start', height: 44, padding: '0 18px', borderRadius: 22, background: '#fff', color: '#1d1a17', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
        {Icon.plus}
        {done ? 'Apprendre autre chose' : 'Choisir un sujet'}
      </span>
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
      <motion.div
        initial={{ scale: 0.6, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 12 }}
        style={{ width: 230, height: 230, borderRadius: 115, background: 'var(--peach-soft)', display: 'grid', placeItems: 'center' }}
      >
        <img src={illustration('scene-welcome')} alt="" width={200} height={200} />
      </motion.div>
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
      {[214, 172, 172].map((h, i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
          style={{ gridColumn: i === 0 ? '1 / -1' : undefined, height: h, borderRadius: 30, background: 'var(--bg-deep)' }}
        />
      ))}
    </div>
  )
}
