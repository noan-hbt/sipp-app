import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { Mascot } from '../components/Mascot'
import { CountUp } from '../components/motion'
import { Screen } from '../components/Screen'
import { illustration } from '../components/SipIcon'
import { Button, Icon, IconButton, Star } from '../components/ui'
import { Api, apiErrorMessage, ApiError, type QuizResult } from '../lib/api'
import { play } from '../lib/sound'
import { track } from '../lib/telemetry'
import { LessonPlayer, type Finished } from './Lesson'

/** End of a module: a few questions from its lessons, graded on the server, best result kept. */
export function ModuleQuiz() {
  const { moduleId = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const sipId = (useLocation().state as { sipId?: string } | null)?.sipId
  const [round, setRound] = useState(0)
  const quiz = useQuery({ queryKey: ['quiz', moduleId, round], queryFn: () => Api.quiz(moduleId), staleTime: Infinity, gcTime: 0 })
  const submit = useMutation({
    mutationFn: ({ answers }: Finished) =>
      Api.submitQuiz(moduleId, {
        items: quiz.data!.items.map(({ lesson_id, block_index }) => ({ lesson_id, block_index })),
        answers: Object.entries(answers).map(([i, a]) => ({ block: Number(i), ...a })),
      }),
    onSuccess: (r) => {
      track('module_quiz_done', { stars: r.stars, correct: r.correct, total: r.total })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      if (sipId) void qc.invalidateQueries({ queryKey: ['sip', sipId] })
    },
  })
  const back = () => (sipId ? nav(`/sips/${sipId}`, { replace: true }) : nav(-1))

  if (submit.data) {
    return (
      <Result
        r={submit.data}
        onBack={back}
        onAgain={() => {
          submit.reset()
          setRound((n) => n + 1)
        }}
      />
    )
  }
  if (!quiz.data) {
    const notReady = quiz.error instanceof ApiError && quiz.error.status === 409
    const locked = quiz.error instanceof ApiError && quiz.error.code === 'plan_feature'
    return (
      <Screen kind="modal">
        <header className="topbar">
          <IconButton label="Fermer" onClick={back}>{Icon.close}</IconButton>
        </header>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 32px 80px', textAlign: 'center' }}>
          <Mascot mood={quiz.isError ? 'oops' : 'think'} size={96} />
          {quiz.isError ? (
            locked ? (
              <>
                <p className="muted" style={{ fontSize: 16 }}>Le quiz de fin de module est inclus dès l’offre Essentiel.</p>
                <Button onClick={() => nav('/offers')}>Voir les offres</Button>
              </>
            ) : notReady ? (
              <p className="muted" style={{ fontSize: 16 }}>Termine toutes les leçons du module pour ouvrir son quiz.</p>
            ) : (
              <ErrorNotice message={apiErrorMessage(quiz.error, 'Le quiz n’a pas pu se charger. Réessaie.')} retry={() => void quiz.refetch()} busy={quiz.isFetching} />
            )
          ) : (
            <p className="muted" style={{ fontSize: 16 }}>Je choisis tes questions…</p>
          )}
        </div>
      </Screen>
    )
  }
  if (quiz.data.items.length === 0) {
    return (
      <Screen kind="modal">
        <header className="topbar">
          <IconButton label="Fermer" onClick={back}>{Icon.close}</IconButton>
        </header>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 32px 80px', textAlign: 'center' }}>
          <Mascot size={96} />
          <p className="muted" style={{ fontSize: 16 }}>Ce module n’a pas d’exercice à reprendre. Passe à la suite !</p>
          <Button variant="soft" onClick={back}>Retour au parcours</Button>
        </div>
      </Screen>
    )
  }
  return (
    <LessonPlayer
      key={round}
      title={`Quiz · ${quiz.data.title}`}
      blocks={quiz.data.items.map((i) => i.block)}
      onClose={back}
      onFinish={(f) => submit.mutate(f)}
      finishing={submit.isPending}
      finishError={submit.isError ? apiErrorMessage(submit.error, 'Ton quiz n’a pas été enregistré. Réessaie.') : undefined}
      finishLabel="Voir mon résultat"
    />
  )
}

/** Indigo celebration, same in light and dark: score in big, stars dropping in, then where to go next. */
function Result({ r, onBack, onAgain }: { r: QuizResult; onBack: () => void; onAgain: () => void }) {
  useEffect(() => {
    play(r.stars >= 2 ? 'complete' : 'pop')
  }, [r.stars])
  return (
    <Screen kind="fade" bg="#4a3fb0">
      <div className="scroll" style={{ position: 'relative', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 'calc(var(--safe-top) + 28px) 22px calc(var(--safe-bottom) + 24px)', textAlign: 'center' }}>
        <motion.span
          aria-hidden="true"
          initial={{ scale: 0.3 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 110, damping: 15 }}
          style={{ position: 'absolute', left: '50%', top: 'calc(var(--safe-top) + 40px)', width: 320, height: 320, marginLeft: -160, borderRadius: 160, background: '#5a4fc4' }}
        />
        <span className="kicker" style={{ position: 'relative', color: '#cbc2ff' }}>Quiz du module</span>
        <motion.img
          src={illustration('scene-quiz')}
          alt=""
          width={190}
          height={190}
          initial={{ scale: 0.4, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 13 }}
          style={{ position: 'relative' }}
        />
        <div aria-label={`${r.stars} étoiles sur 3`} style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 6, height: 58, marginTop: -16 }}>
          {[1, 2, 3].map((n) => (
            <span key={n} style={{ marginBottom: n === 2 ? 12 : 0, transform: `rotate(${(n - 2) * 12}deg)` }}>
              <Star size={n === 2 ? 52 : 40} filled={r.stars >= n} animate delay={0.3 + n * 0.2} />
            </span>
          ))}
        </div>
        <span className="hero-num" style={{ position: 'relative', fontSize: 92, marginTop: 6 }}>
          <CountUp value={r.correct} delay={0.4} />
          <span style={{ fontSize: 46, color: '#cbc2ff' }}>/{r.total}</span>
        </span>
        <h1 className="display" style={{ position: 'relative', fontSize: 30, lineHeight: 1.05 }}>
          {r.stars === 3 ? 'Module maîtrisé !' : r.stars === 2 ? 'Bien ancré !' : 'À consolider'}
        </h1>
        {r.gained > 0 && (
          <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1, type: 'spring', stiffness: 400, damping: 14 }} className="chip" style={{ position: 'relative', background: '#ffc93d', color: '#3b2c05' }}>
            +{r.gained} étoile{r.gained > 1 ? 's' : ''}
          </motion.span>
        )}
        {r.gained === 0 && r.best_stars > r.stars && <p style={{ position: 'relative', fontSize: 14, color: '#cbc2ff' }}>Ton meilleur score reste {r.best_stars} étoiles.</p>}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.9 }}
          style={{ position: 'relative', width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 16 }}
        >
          <Button onClick={onBack} sound="pop" style={{ background: '#fff', color: '#4a3fb0' }}>
            Retour au parcours
          </Button>
          {r.stars < 3 && (
            <Button variant="ghost" onClick={onAgain} style={{ color: '#fff', height: 48 }}>
              Viser les 3 étoiles
            </Button>
          )}
        </motion.div>
      </div>
    </Screen>
  )
}
