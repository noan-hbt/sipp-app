import { useMutation, useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { RichText } from '../components/RichText'
import { illustration } from '../components/SipIcon'
import { Button, Icon, Star } from '../components/ui'
import { ReportSheet } from '../components/ReportSheet'
import { UpsellSheet, useFeatures, type Feature } from '../components/UpsellSheet'
import { Api, type CompleteOut, type Feeling } from '../lib/api'
import { LESSON_MINUTES } from '../lib/format'
import { shareSip } from '../lib/share'
import { play } from '../lib/sound'
import { track } from '../lib/telemetry'

type DoneState = CompleteOut & {
  correct: number
  total: number
  sipId: string
  title: string
  concepts: string[]
  objective?: string
  points?: string[]
  action?: string | null
}

const CONFETTI = ['#FFD7BD', 'var(--lavender-strong)', 'var(--mint-strong)', 'var(--star)', 'var(--sky-strong)', '#fff']

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
    <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: 170, pointerEvents: 'none', zIndex: 3 }}>
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

/** The objective counts as reached only with at least 2/3 of the checks right. */
export function mastered(correct: number, total: number) {
  return total === 0 || correct / total >= 2 / 3
}

/** What was learned: the lesson's outcome, the ideas to keep, an optional mini-action. */
export function Takeaways({
  objective,
  points,
  action,
  mastered,
  delay = 0,
}: {
  objective: string
  points: string[]
  action: string | null
  mastered: boolean
  delay?: number
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 20, delay }}
      className="card"
      style={{ borderRadius: 22, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: mastered ? 'var(--mint-ink)' : 'var(--muted)' }}>
          {mastered ? <>{Icon.check(14)} Objectif atteint</> : 'Objectif de la leçon'}
        </span>
        <p style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.4 }}>
          <RichText text={objective} />
        </p>
      </div>
      {points.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>À retenir</span>
          {points.map((p) => (
            <p key={p} style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink-soft)', paddingLeft: 14, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, top: 9, width: 6, height: 6, borderRadius: 3, background: 'var(--primary)' }} />
              <RichText text={p} />
            </p>
          ))}
        </div>
      )}
      {action && (
        <div style={{ borderRadius: 18, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--lavender)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--lavender-ink)' }}>À essayer aujourd’hui</span>
          <p style={{ fontSize: 15, lineHeight: 1.45 }}>
            <RichText text={action} />
          </p>
        </div>
      )}
    </motion.section>
  )
}

const FEELINGS: [Feeling, string][] = [['easy', 'Trop facile'], ['ok', 'Parfait'], ['hard', 'Trop dur']]

/** How the lesson felt: too easy / too hard tunes the next lessons of the Sip. */
function FeelingCard({ lessonId, delay }: { lessonId: string; delay: number }) {
  const [picked, setPicked] = useState<Feeling | null>(null)
  const send = useMutation({
    mutationFn: (feeling: Feeling) => Api.feedback(lessonId, { feeling }),
    onSuccess: (_, feeling) => track('lesson_feeling', { feeling }),
  })
  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="card" style={{ borderRadius: 22, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>Cette leçon, c’était…</span>
      <div role="radiogroup" aria-label="Ton ressenti" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {FEELINGS.map(([k, label]) => {
          const on = picked === k
          return (
            <motion.button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              whileTap={{ scale: 0.95 }}
              disabled={!!picked}
              onClick={() => {
                setPicked(k)
                send.mutate(k)
              }}
              style={{ border: 'none', borderRadius: 16, padding: '10px 4px', fontSize: 15, fontWeight: 600, background: on ? 'var(--primary)' : 'var(--bg-deep)', color: on ? '#fff' : 'var(--ink-soft)', opacity: picked && !on ? 0.55 : 1 }}
            >
              {label}
            </motion.button>
          )
        })}
      </div>
      {picked && (
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} role="status" style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.4 }}>
          {send.isError
            ? 'Ton avis n’a pas pu être envoyé.'
            : picked === 'easy'
              ? 'Noté : je corse un peu les prochaines leçons.'
              : picked === 'hard'
                ? 'Noté : j’y vais plus doucement pour la suite.'
                : 'Merci ! On garde ce rythme.'}
        </motion.span>
      )}
    </motion.section>
  )
}

/** The last lesson of a Sip: an image to share. */
function ShareButton({ sipId, title }: { sipId: string; title: string }) {
  const sip = useQuery({ queryKey: ['sip', sipId], queryFn: ({ signal }) => Api.sip(sipId, signal) })
  const [state, setState] = useState<'idle' | 'busy' | 'downloaded'>('idle')
  const lessons = sip.data?.modules.flatMap((m) => m.lessons) ?? []
  const stars = lessons.reduce((n, l) => n + (l.stars ?? 0), 0)
  return (
    <Button
      variant="soft"
      disabled={!sip.data || state === 'busy'}
      onClick={async () => {
        setState('busy')
        try {
          const how = await shareSip({ title: sip.data?.title ?? title, lessons: lessons.length, minutes: lessons.length * LESSON_MINUTES, stars })
          if (how !== 'cancelled') track('sip_shared', { how })
          setState(how === 'downloaded' ? 'downloaded' : 'idle')
        } catch {
          setState('idle')
        }
      }}
    >
      {state === 'downloaded' ? 'Image enregistrée' : state === 'busy' ? 'Préparation…' : 'Partager ma réussite'}
    </Button>
  )
}

export function LessonDone() {
  const { lessonId } = useParams()
  const nav = useNavigate()
  const s = (useLocation().state ?? null) as DoneState | null
  const [report, setReport] = useState(false)
  const [upsell, setUpsell] = useState<Feature | null>(null)
  const features = useFeatures()

  useEffect(() => {
    if (!s) return
    play('complete')
  }, [s])

  if (!s) return <Navigate to="/" replace />

  const pct = Math.round((s.progress.completed / Math.max(1, s.progress.total)) * 100)
  return (
    <Screen kind="fade" bg="var(--primary)">
      <Confetti />
      <div className="scroll" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', padding: 'calc(var(--safe-top) + 24px) 22px 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center', color: '#fff' }}>
          <motion.img
            src={illustration('scene-celebrate')}
            alt=""
            width={220}
            height={220}
            initial={{ scale: 0.4, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 13, delay: 0.1 }}
          />
          <div aria-label={`${s.stars} étoiles sur 3`} style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 52, marginTop: -8 }}>
            <span style={{ transform: 'rotate(-12deg)' }}>
              <Star size={34} filled={s.stars >= 1} animate delay={0.35} />
            </span>
            <span style={{ marginBottom: 10 }}>
              <Star size={44} filled={s.stars >= 2} animate delay={0.6} />
            </span>
            <span style={{ transform: 'rotate(12deg)' }}>
              <Star size={34} filled={s.stars >= 3} animate delay={0.85} />
            </span>
          </div>
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="display" style={{ fontSize: 36, lineHeight: 1.05 }}>
            {s.stars === 3 ? 'Sans faute !' : s.stars === 2 ? 'Bien joué !' : 'Leçon bouclée !'}
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} style={{ fontSize: 16, color: 'rgba(255,255,255,.85)' }}>
            {s.title}
          </motion.p>
        </div>

        <motion.div
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.5 }}
          style={{ flex: 1, borderRadius: '32px 32px 0 0', background: 'var(--bg)', padding: '22px 16px calc(var(--safe-bottom) + 22px)', display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {[
              [s.total ? `${s.correct}/${s.total}` : '✓', s.total ? 'bonnes réponses' : 'leçon lue', 'var(--mint)'],
              [`${s.streak_days} j`, 'de série', 'var(--peach-soft)'],
              [`${pct} %`, 'du parcours', 'var(--lavender)'],
            ].map(([v, l, bg], i) => (
              <motion.div
                key={l}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.8 + i * 0.1 }}
                style={{ borderRadius: 20, background: bg, padding: '12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
              >
                <span className="display" style={{ fontSize: 21 }}>
                  {v}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{l}</span>
              </motion.div>
            ))}
          </div>

          {!!s.module_bonus && (
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 15, delay: 1.1 }}
              style={{ borderRadius: 20, background: 'var(--butter)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <span style={{ display: 'flex' }}>
                <Star size={30} animate delay={1.3} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span className="display" style={{ fontSize: 18 }}>Module terminé !</span>
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>+{s.module_bonus} étoiles bonus</span>
              </span>
            </motion.div>
          )}

          {!!s.module_done && s.module_id && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.15 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => (features.quiz ? nav(`/modules/${s.module_id}/quiz`, { state: { sipId: s.sipId } }) : setUpsell('quiz'))}
              style={{ border: 'none', borderRadius: 22, padding: '14px 16px', background: 'var(--lavender)', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
            >
              <span style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--lavender-strong)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 700, fontSize: 20 }}>?</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Quiz du module</span>
                <span style={{ fontSize: 14, color: 'var(--lavender-ink)' }}>5 questions pour tout ancrer · jusqu’à 3 étoiles</span>
              </span>
              {!features.quiz && <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 13, background: 'var(--sun)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg></span>}
            </motion.button>
          )}

          {s.objective && <Takeaways objective={s.objective} points={s.points ?? []} action={s.action ?? null} mastered={mastered(s.correct, s.total)} delay={1} />}

          {s.concepts.length > 0 && (
            <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }} className="card" style={{ borderRadius: 22, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Dans ta poche</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {s.concepts.map((c, i) => (
                  <motion.span
                    key={c}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 1.25 + i * 0.08 }}
                    className="chip"
                    style={{ background: ['var(--peach-soft)', 'var(--lavender)', 'var(--mint)', 'var(--sky)'][i % 4], color: ['var(--peach-ink)', 'var(--lavender-ink)', 'var(--mint-ink)', 'var(--sky-ink)'][i % 4] }}
                  >
                    + {c}
                  </motion.span>
                ))}
              </div>
            </motion.section>
          )}

          {lessonId && <FeelingCard lessonId={lessonId} delay={1.2} />}

          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 1.3 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 6 }}
          >
            <Button variant="dark" sound="pop" onClick={() => nav(`/sips/${s.sipId}`, { replace: true, state: { completed: lessonId } })}>
              {s.next_lesson_id ? 'Leçon suivante' : 'Voir mon parcours'}
            </Button>
            {s.progress.total > 0 && s.progress.completed >= s.progress.total && <ShareButton sipId={s.sipId} title={s.title} />}
            {!mastered(s.correct, s.total) && (
              <Button variant="soft" onClick={() => nav(`/lessons/${lessonId}`, { replace: true })}>
                Refaire la leçon
              </Button>
            )}
            <Button variant="ghost" style={{ height: 44, fontSize: 16 }} onClick={() => nav('/', { replace: true })}>
              J’arrête là pour aujourd’hui
            </Button>
            <button type="button" onClick={() => setReport(true)} style={{ alignSelf: 'center', border: 'none', background: 'none', padding: 8, fontSize: 14, fontWeight: 500, color: 'var(--muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Signaler un problème dans cette leçon
            </button>
          </motion.div>
          <UpsellSheet feature={upsell} onClose={() => setUpsell(null)} />
          {lessonId && <ReportSheet lessonId={lessonId} open={report} onClose={() => setReport(false)} />}
        </motion.div>
      </div>
    </Screen>
  )
}
