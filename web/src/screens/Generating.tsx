import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { ErrorNotice } from '../components/ErrorNotice'
import { Screen } from '../components/Screen'
import { illustration } from '../components/SipIcon'
import { Icon, IconButton } from '../components/ui'
import { Api, apiErrorMessage, type SipDetail } from '../lib/api'
import { duration } from '../lib/format'
import { play } from '../lib/sound'

const LEVEL: Record<string, string> = {
  none: 'grand débutant',
  beginner: 'débutant',
  intermediate: 'intermédiaire',
  advanced: 'à l’aise',
  expert: 'expert',
}
const MODULE_COLORS = [
  ['var(--peach-soft)', 'var(--peach-ink)'],
  ['var(--lavender)', 'var(--lavender-ink)'],
  ['var(--mint)', 'var(--mint-ink)'],
  ['var(--sky)', 'var(--sky-ink)'],
  ['var(--butter)', 'var(--butter-ink)'],
]

type Phase = 'read' | 'program' | 'plan' | 'cut' | 'first' | 'done'

/** Where the build is, and the share of the cup to fill (each phase owns a band). */
function progressOf(sip: SipDetail | undefined): { phase: Phase; from: number; to: number; mapped: number } {
  if (!sip) return { phase: 'read', from: 0, to: 0.15, mapped: 0 }
  const stage = sip.stage ?? ''
  if (sip.status === 'ready') {
    const ready = sip.modules[0]?.lessons[0]?.status === 'ready'
    return ready ? { phase: 'done', from: 1, to: 1, mapped: Infinity } : { phase: 'first', from: 0.85, to: 0.98, mapped: Infinity }
  }
  if (stage.startsWith('mapping')) {
    const [i, n] = stage.split(':')[1].split('/').map(Number)
    const a = 0.35 + (0.5 * (i - 1)) / n
    return { phase: 'cut', from: a, to: a + 0.5 / n, mapped: i - 1 }
  }
  if (stage === 'curriculum') return { phase: 'plan', from: 0.15, to: 0.35, mapped: 0 }
  if (stage === 'roadmap') return { phase: 'program', from: 0.08, to: 0.2, mapped: 0 }
  return { phase: 'read', from: 0.02, to: 0.15, mapped: 0 }
}

const TITLES: Record<Phase, string> = {
  read: 'Je lis ta demande…',
  program: 'C’est un grand projet ! Je le découpe en chapitres…',
  plan: 'Je trace le chemin…',
  cut: 'Je découpe en leçons…',
  first: 'Je prépare ta première leçon…',
  done: 'Ton parcours est prêt !',
}

export function Generating() {
  const { sipId = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const sip = useQuery({
    queryKey: ['sip', sipId],
    queryFn: ({ signal }) => Api.sip(sipId, signal),
    refetchInterval: (q) => {
      const s = q.state.data
      const first = s?.modules[0]?.lessons[0]?.status
      return s && (s.status === 'failed' || (s.status === 'ready' && (first === 'ready' || first === 'failed'))) ? false : 2000
    },
  })
  const retry = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      const first = sip.data?.modules[0]?.lessons[0]
      if (sip.data?.status === 'ready' && first?.status === 'failed') {
        const lesson = await Api.lesson(first.id)
        qc.setQueryData<SipDetail>(['sip', sipId], (s) => s && {
          ...s,
          modules: s.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => l.id === lesson.id ? { ...l, status: lesson.status } : l) })),
        })
      } else await Api.retrySip(sipId)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sip', sipId] }),
  })
  const firstFailed = sip.data?.status === 'ready' && sip.data.modules[0]?.lessons[0]?.status === 'failed'
  const failed = sip.data?.status === 'failed' || firstFailed
  const readError = sip.isError || sip.isPaused
  const { phase, from, to, mapped } = progressOf(sip.data)
  const lastPhase = useRef(phase)
  const done = phase === 'done'

  useEffect(() => {
    if (phase !== lastPhase.current) play(phase === 'done' ? 'complete' : 'unlock')
    lastPhase.current = phase
    if (phase === 'done') {
      const t = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['sips'] })
        void qc.invalidateQueries({ queryKey: ['programs'] })
        const s = sip.data
        // A new program opens on its roadmap; later chapters go straight to their map.
        if (s?.program_id && s.chapter === 1) nav(`/programs/${s.program_id}`, { replace: true })
        else nav(`/sips/${sipId}`, { replace: true, state: { fresh: true } })
      }, 1800)
      return () => clearTimeout(t)
    }
  }, [phase, nav, qc, sipId, sip.data])

  const profile = sip.data?.profile
  const lessons = sip.data?.modules.reduce((n, m) => n + m.lessons.length, 0) ?? 0
  const outline = sip.data?.outline?.length ? sip.data.outline : (sip.data?.modules.map((m) => m.title) ?? [])
  const facts = profile
    ? [
        ...(profile.level_details.length
          ? profile.level_details.slice(0, 2).map((d) => `${d.area} : ${LEVEL[d.level] ?? d.level}`)
          : [`Niveau ${LEVEL[profile.current_level] ?? profile.current_level}`]),
        profile.goals[0],
      ].filter(Boolean)
    : []

  const level = useBrewLevel(from, to)
  const pct = useTransform(level, (v) => Math.round(Math.min(1, v) * 100))
  const bad = failed || readError
  const heading = sip.data?.chapter ? `Chapitre ${sip.data.chapter} · ${sip.data.title}` : (profile?.title ?? clip(sip.data?.input_text ?? '…', 90))

  return (
    <Screen kind="fade">
      <Liquid level={level} failed={bad} />
      <header className="topbar" style={{ position: 'relative' }}>
        <IconButton label="Fermer" onClick={() => nav('/', { replace: true })}>
          {Icon.close}
        </IconButton>
      </header>

      <div className="scroll" style={{ position: 'relative', padding: '0 20px calc(var(--safe-bottom) + 28px)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="kicker" style={{ color: bad ? 'var(--rose-ink)' : 'var(--primary)' }}>
            {bad ? 'Petit souci' : phase === 'done' ? 'C’est prêt' : 'Ton Sip infuse'}
          </span>
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="display" style={{ fontSize: 34, lineHeight: 1, letterSpacing: '-0.045em', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {heading}
          </motion.h1>
          {!bad && facts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
              {facts.map((f, i) => (
                <motion.span
                  key={f}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.1 + i * 0.1 }}
                  className="chip"
                  style={{ background: 'var(--surface)', color: 'var(--ink-soft)', fontSize: 13 }}
                >
                  {clip(f, 42)}
                </motion.span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 150 }}>
          <span className="hero-num" aria-hidden="true" style={{ fontSize: 92, color: bad ? 'var(--rose-ink)' : 'var(--ink)' }}>
            <motion.span>{pct}</motion.span>
            <span style={{ fontSize: 44, color: bad ? 'var(--rose-ink)' : 'var(--primary)' }}>%</span>
          </span>
          <motion.div
            initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
            animate={done ? { scale: [1, 1.12, 1], rotate: 0, opacity: 1 } : { scale: 1, rotate: 0, opacity: 1 }}
            transition={done ? { duration: 0.6 } : { type: 'spring', stiffness: 200, damping: 13, delay: 0.1 }}
          >
            {bad ? <Mascot mood="oops" size={130} /> : <img src={illustration(done ? 'scene-celebrate' : 'scene-brewing')} alt="" width={150} height={150} style={{ display: 'block' }} />}
          </motion.div>
        </div>

        <AnimatePresence mode="wait">
          <motion.h2
            key={bad ? 'failed' : phase}
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="display"
            style={{ fontSize: 21, lineHeight: 1.15 }}
          >
            {firstFailed ? 'Ta première leçon m’a résisté' : failed ? 'Oups, j’ai buggé' : readError ? 'Ton parcours ne se charge pas' : sip.data?.chapter && phase === 'read' ? 'Je prépare ce chapitre…' : TITLES[phase]}
          </motion.h2>
        </AnimatePresence>

        {readError && !failed && <ErrorNotice message={apiErrorMessage(sip.error, sip.isPaused ? 'Tu es hors ligne. Réessaie quand tu es connecté.' : 'Ton parcours n’a pas pu se charger. Réessaie.')} retry={() => void sip.refetch()} busy={sip.isFetching} />}
        {failed ? (
          <ErrorNotice message={apiErrorMessage(retry.error, firstFailed ? 'Relance ta première leçon pour continuer.' : 'Relance ton parcours pour continuer.')} retry={() => retry.mutate()} busy={retry.isPending} />
        ) : (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lessons > 0 && (
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginLeft: 4 }}>
                {outline.length} modules · {lessons} leçons · {duration(lessons)}
              </span>
            )}
            {outline.length === 0
              ? [0, 1, 2].map((i) => <GhostRow key={i} delay={i * 0.15} />)
              : outline.map((title, i) => <ModuleRow key={i} index={i} title={title} state={i < mapped ? 'done' : i === mapped && phase === 'cut' ? 'active' : 'todo'} />)}
          </section>
        )}

        {!bad && (
          <p style={{ marginTop: 'auto', textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--peach-ink)' }}>
            Tu peux fermer l’app, je continue sans toi.
          </p>
        )}
      </div>
    </Screen>
  )
}

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/** The cup level: jumps to the phase's start, then creeps slowly toward its end so it never looks stuck. */
function useBrewLevel(from: number, to: number) {
  const level = useMotionValue(0)
  useEffect(() => {
    let creep: ReturnType<typeof animate> | undefined
    const jump = animate(level, Math.max(level.get(), from), { type: 'spring', stiffness: 70, damping: 20 })
    void jump.then(() => {
      creep = animate(level, to - (to - from) * 0.08, { duration: 40, ease: [0.1, 0.6, 0.3, 1] })
    })
    return () => {
      jump.stop()
      creep?.stop()
    }
  }, [from, to, level])
  return level
}

// 16 crests of 84px: the CSS `wave` keyframe slides one crest, so the loop is seamless at any screen width.
const WAVE = `M0 8 Q 21 0 42 8 ${Array.from({ length: 31 }, (_, i) => `T ${84 + i * 42} 8`).join(' ')} V16 H0 Z`

/** The whole screen fills like a cup being poured: a soft tint rises from the bottom with a wave on top. */
function Liquid({ level, failed }: { level: MotionValue<number>; failed: boolean }) {
  const height = useTransform(level, (v) => `${Math.min(1, v) * 100}%`)
  const fill = failed ? 'var(--rose-mid)' : 'var(--peach-mid)'
  return (
    <motion.div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: -15, height: 16, overflow: 'hidden' }}>
        <svg width="1344" height="16" viewBox="0 0 1344 16" style={{ display: 'block', animation: 'wave 2.4s linear infinite' }}>
          <path d={WAVE} fill={fill} />
        </svg>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: fill }} />
    </motion.div>
  )
}

function GhostRow({ delay }: { delay: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.45, 0.9, 0.45] }}
      transition={{ duration: 1.6, repeat: Infinity, delay }}
      style={{ height: 58, borderRadius: 22, background: 'var(--surface)' }}
    />
  )
}

function ModuleRow({ index, title, state }: { index: number; title: string; state: 'done' | 'active' | 'todo' }) {
  const [bg, ink] = MODULE_COLORS[index % MODULE_COLORS.length]
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: index * 0.12 }}
      onAnimationComplete={() => index === 0 && play('pop')}
      className="card"
      style={{ borderRadius: 22, padding: '10px 14px 10px 10px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 58 }}
    >
      <span style={{ width: 38, height: 38, borderRadius: 19, flexShrink: 0, display: 'grid', placeItems: 'center', background: bg, color: ink, fontFamily: 'var(--display)', fontSize: 16, fontWeight: 800 }}>{index + 1}</span>
      <span style={{ flex: 1, fontSize: 15, fontWeight: 500, lineHeight: 1.3, color: state === 'todo' ? 'var(--faint)' : 'var(--ink)' }}>{title}</span>
      <span style={{ width: 26, height: 26, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <AnimatePresence mode="wait">
          {state === 'done' ? (
            <motion.span key="d" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }} style={{ width: 26, height: 26, borderRadius: 13, background: 'var(--mint)', display: 'grid', placeItems: 'center' }}>
              {Icon.check(14, 'var(--mint-ink)')}
            </motion.span>
          ) : state === 'active' ? (
            <motion.span key="a" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ width: 20, height: 20, borderRadius: 10, border: '3px solid var(--track)', borderTopColor: 'var(--primary)' }} />
          ) : null}
        </AnimatePresence>
      </span>
    </motion.div>
  )
}
