import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, type SipDetail } from '../lib/api'
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

type Phase = 'read' | 'plan' | 'cut' | 'first' | 'done'

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
  return { phase: 'read', from: 0.02, to: 0.15, mapped: 0 }
}

const TITLES: Record<Phase, string> = {
  read: 'Je lis ta demande…',
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
    queryFn: () => Api.sip(sipId),
    refetchInterval: (q) => {
      const s = q.state.data
      return s && (s.status === 'failed' || (s.status === 'ready' && s.modules[0]?.lessons[0]?.status === 'ready')) ? false : 2000
    },
  })
  const retry = useMutation({
    mutationFn: () => Api.retrySip(sipId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sip', sipId] }),
  })
  const failed = sip.data?.status === 'failed'
  const { phase, from, to, mapped } = progressOf(sip.data)
  const lastPhase = useRef(phase)

  useEffect(() => {
    if (phase !== lastPhase.current) play(phase === 'done' ? 'complete' : 'unlock')
    lastPhase.current = phase
    if (phase === 'done') {
      const t = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['sips'] })
        nav(`/sips/${sipId}`, { replace: true, state: { fresh: true } })
      }, 1800)
      return () => clearTimeout(t)
    }
  }, [phase, nav, qc, sipId])

  const profile = sip.data?.profile
  const outline = sip.data?.outline?.length ? sip.data.outline : (sip.data?.modules.map((m) => m.title) ?? [])
  const facts = profile
    ? [
        ...(profile.level_details.length
          ? profile.level_details.slice(0, 2).map((d) => `${d.area} : ${LEVEL[d.level] ?? d.level}`)
          : [`Niveau ${LEVEL[profile.current_level] ?? profile.current_level}`]),
        profile.goals[0],
      ].filter(Boolean)
    : []

  return (
    <Screen kind="fade">
      <header className="topbar">
        <IconButton label="Fermer" onClick={() => nav('/', { replace: true })}>
          {Icon.close}
        </IconButton>
      </header>

      <div className="scroll" style={{ padding: '0 22px calc(var(--safe-bottom) + 28px)', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <Brew from={from} to={to} failed={failed} done={phase === 'done'} />
          <AnimatePresence mode="wait">
            <motion.h1
              key={failed ? 'failed' : phase}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="title-l"
            >
              {failed ? 'Oups, j’ai buggé' : TITLES[phase]}
            </motion.h1>
          </AnimatePresence>
          <p className="muted" style={{ fontSize: 15, fontWeight: 700, maxWidth: 320 }}>
            {failed ? 'Ça arrive. Relance, ça ne te coûte rien.' : (profile?.title ?? '« ' + clip(sip.data?.input_text ?? '…', 90) + ' »')}
          </p>
          {!failed && facts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
              {facts.map((f, i) => (
                <motion.span
                  key={f}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.1 + i * 0.1 }}
                  className="chip"
                  style={{ background: 'var(--surface)', color: 'var(--ink-soft)', fontSize: 13, boxShadow: '0 0 0 1px rgba(43,38,32,.06)' }}
                >
                  {clip(f, 42)}
                </motion.span>
              ))}
            </div>
          )}
        </div>

        {failed ? (
          <Button onClick={() => retry.mutate()} disabled={retry.isPending}>
            Réessayer
          </Button>
        ) : (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#9c4a22', textTransform: 'uppercase', letterSpacing: '.06em', marginLeft: 4 }}>Ton parcours</span>
            {outline.length === 0
              ? [0, 1, 2].map((i) => <GhostRow key={i} delay={i * 0.15} />)
              : outline.map((title, i) => <ModuleRow key={i} index={i} title={title} state={i < mapped ? 'done' : i === mapped && phase === 'cut' ? 'active' : 'todo'} />)}
          </section>
        )}

        <p className="muted" style={{ marginTop: 'auto', textAlign: 'center', fontSize: 14, fontWeight: 700 }}>
          Tu peux fermer l’app, je continue sans toi.
        </p>
      </div>
    </Screen>
  )
}

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/**
 * The mascot sits in a round window that fills like a cup being poured.
 * Within a phase the level creeps slowly toward the phase's end, so it never looks stuck.
 */
function Brew({ from, to, failed, done }: { from: number; to: number; failed: boolean; done: boolean }) {
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
  const y = useTransform(level, (v) => 168 * (1 - Math.min(1, v)))
  const size = 168
  return (
    <motion.div
      className="raised"
      animate={done ? { scale: [1, 1.07, 1] } : {}}
      transition={{ duration: 0.6 }}
      style={{ width: size + 20, height: size + 20, borderRadius: '50%', display: 'grid', placeItems: 'center', marginTop: 4 }}
    >
      <div className="inset" style={{ width: size, height: size, borderRadius: '50%', position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
        <motion.div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: size * 2, y }}>
          <svg width={size * 2} height="16" viewBox="0 0 336 16" style={{ display: 'block', animation: 'wave 2.4s linear infinite' }}>
            <path d="M0 8 Q 21 0 42 8 T 84 8 T 126 8 T 168 8 T 210 8 T 252 8 T 294 8 T 336 8 V16 H0 Z" fill={failed ? '#F3C9D2' : '#EAD8C3'} />
          </svg>
          <div style={{ height: size * 2, marginTop: -1, background: failed ? '#F3C9D2' : '#EAD8C3' }} />
        </motion.div>
        <div style={{ position: 'relative' }}>
          <Mascot mood={failed ? 'oops' : done ? 'bravo' : 'think'} size={104} />
        </div>
      </div>
    </motion.div>
  )
}

function GhostRow({ delay }: { delay: number }) {
  return (
    <motion.div
      className="well"
      animate={{ opacity: [0.45, 0.9, 0.45] }}
      transition={{ duration: 1.6, repeat: Infinity, delay }}
      style={{ height: 58, borderRadius: 20 }}
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
      style={{ borderRadius: 20, padding: '10px 14px 10px 10px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 58 }}
    >
      <span style={{ width: 38, height: 38, borderRadius: 13, flexShrink: 0, display: 'grid', placeItems: 'center', background: bg, color: ink, fontSize: 16, fontWeight: 900 }}>{index + 1}</span>
      <span style={{ flex: 1, fontSize: 15, fontWeight: 800, lineHeight: 1.3, color: state === 'todo' ? 'var(--muted)' : 'var(--ink)' }}>{title}</span>
      <span style={{ width: 26, height: 26, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <AnimatePresence mode="wait">
          {state === 'done' ? (
            <motion.span key="d" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }} style={{ width: 26, height: 26, borderRadius: 13, background: 'var(--mint)', display: 'grid', placeItems: 'center' }}>
              {Icon.check(14, '#2F7A52')}
            </motion.span>
          ) : state === 'active' ? (
            <motion.span key="a" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} style={{ width: 20, height: 20, borderRadius: 10, border: '3px solid var(--track)', borderTopColor: 'var(--peach-lip)' }} />
          ) : null}
        </AnimatePresence>
      </span>
    </motion.div>
  )
}
