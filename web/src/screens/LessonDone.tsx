import { motion } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button, Icon, Star } from '../components/ui'
import type { CompleteOut } from '../lib/api'
import { play } from '../lib/sound'

type DoneState = CompleteOut & { correct: number; total: number; sipId: string; title: string; concepts: string[] }

const CONFETTI = ['var(--peach)', 'var(--lavender-strong)', 'var(--mint-strong)', 'var(--star)', '#8DB8E0', '#E79AAA']

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: (Math.random() - 0.5) * 340,
        y: -120 - Math.random() * 260,
        r: Math.random() * 540 - 270,
        s: 6 + Math.random() * 8,
        c: CONFETTI[i % CONFETTI.length],
        round: i % 3 === 0,
        d: Math.random() * 0.25,
      })),
    [],
  )
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: 210, pointerEvents: 'none', zIndex: 3 }}>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
          animate={{ x: b.x, y: [0, b.y, b.y + 420], opacity: [1, 1, 0], rotate: b.r, scale: 1 }}
          transition={{ duration: 2.2, delay: 0.5 + b.d, ease: [0.2, 0.7, 0.4, 1], times: [0, 0.35, 1] }}
          style={{ position: 'absolute', width: b.s, height: b.round ? b.s : b.s * 0.5, borderRadius: b.round ? b.s : 2, background: b.c }}
        />
      ))}
    </div>
  )
}

export function LessonDone() {
  const { lessonId } = useParams()
  const nav = useNavigate()
  const s = (useLocation().state ?? null) as DoneState | null

  useEffect(() => {
    if (!s) return
    play('complete')
  }, [s])

  if (!s) return <Navigate to="/" replace />

  return (
    <Screen kind="fade">
      <Confetti />
      <div className="scroll" style={{ padding: 'calc(var(--safe-top) + 40px) 22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
          <div aria-label={`${s.stars} étoiles sur 3`} style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 70 }}>
            <span style={{ transform: 'rotate(-12deg)' }}>
              <Star size={44} filled={s.stars >= 1} animate delay={0.35} />
            </span>
            <span style={{ marginBottom: 14 }}>
              <Star size={58} filled={s.stars >= 2} animate delay={0.6} />
            </span>
            <span style={{ transform: 'rotate(12deg)' }}>
              <Star size={44} filled={s.stars >= 3} animate delay={0.85} />
            </span>
          </div>
          <motion.div initial={{ scale: 0, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 12, delay: 0.15 }}>
            <Mascot mood="bravo" size={96} />
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="title-xl">
            {s.stars === 3 ? 'Sans faute !' : s.stars === 2 ? 'Bien joué !' : 'Leçon bouclée !'}
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="muted" style={{ fontSize: 15, fontWeight: 700 }}>
            {s.total ? `${s.correct} bonne${s.correct > 1 ? 's' : ''} réponse${s.correct > 1 ? 's' : ''} sur ${s.total}` : s.title}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20, delay: 1.1 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}
        >
          <div className="raised" style={{ borderRadius: 24, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <motion.span initial={{ scale: 0 }} animate={{ scale: [0, 1.4, 1] }} transition={{ delay: 1.3, duration: 0.5 }} style={{ display: 'grid' }}>
              {Icon.flame}
            </motion.span>
            <span style={{ fontSize: 26, fontWeight: 900 }}>{s.streak_days}</span>
            <span className="muted" style={{ fontSize: 13, fontWeight: 800 }}>
              jour{s.streak_days > 1 ? 's' : ''} d’affilée
            </span>
          </div>
          <div className="raised" style={{ borderRadius: 24, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#B5582A' }}>Parcours</span>
            <span style={{ fontSize: 26, fontWeight: 900 }}>
              {s.progress.completed}/{s.progress.total}
            </span>
            <div className="inset" style={{ width: '100%', height: 10, borderRadius: 5, padding: 2 }}>
              <motion.div
                initial={{ width: `${((s.progress.completed - 1) / Math.max(1, s.progress.total)) * 100}%` }}
                animate={{ width: `${(s.progress.completed / Math.max(1, s.progress.total)) * 100}%` }}
                transition={{ delay: 1.5, type: 'spring', stiffness: 80, damping: 14 }}
                style={{ height: '100%', borderRadius: 4, background: 'var(--peach)' }}
              />
            </div>
          </div>
        </motion.div>

        {s.concepts.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }} className="inset" style={{ borderRadius: 24, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 900 }}>Dans ta poche</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {s.concepts.map((c, i) => (
                <motion.span
                  key={c}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 1.45 + i * 0.08 }}
                  className="chip"
                  style={{ background: ['var(--peach-soft)', 'var(--lavender)', 'var(--mint)', 'var(--sky)'][i % 4], color: ['var(--peach-ink)', 'var(--lavender-ink)', 'var(--mint-ink)', 'var(--sky-ink)'][i % 4] }}
                >
                  + {c}
                </motion.span>
              ))}
            </div>
          </motion.section>
        )}
      </div>

      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 1.6 }}
        className="bottom-bar"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <Button sound="pop" onClick={() => nav(`/sips/${s.sipId}`, { replace: true, state: { completed: lessonId } })}>
          {s.next_lesson_id ? 'Niveau suivant' : 'Voir mon parcours'}
        </Button>
        <Button variant="ghost" style={{ height: 48, fontSize: 16 }} onClick={() => nav('/', { replace: true })}>
          J’arrête là pour aujourd’hui
        </Button>
      </motion.div>
    </Screen>
  )
}
