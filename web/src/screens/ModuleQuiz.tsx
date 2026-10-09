import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
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
    return (
      <Screen kind="modal">
        <header className="topbar">
          <IconButton label="Fermer" onClick={back}>{Icon.close}</IconButton>
        </header>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 32px 80px', textAlign: 'center' }}>
          <Mascot mood={quiz.isError ? 'oops' : 'think'} size={96} />
          {quiz.isError ? (
            notReady ? (
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

function Result({ r, onBack, onAgain }: { r: QuizResult; onBack: () => void; onAgain: () => void }) {
  useEffect(() => {
    play(r.stars >= 2 ? 'complete' : 'pop')
  }, [r.stars])
  return (
    <Screen kind="fade">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 'calc(var(--safe-top) + 24px) 24px calc(var(--safe-bottom) + 24px)', textAlign: 'center' }}>
        <Mascot mood={r.stars >= 2 ? 'bravo' : 'think'} size={110} />
        <div aria-label={`${r.stars} étoiles sur 3`} style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 52 }}>
          {[1, 2, 3].map((n) => (
            <span key={n} style={{ marginBottom: n === 2 ? 10 : 0 }}>
              <Star size={n === 2 ? 44 : 34} filled={r.stars >= n} animate delay={0.2 + n * 0.2} />
            </span>
          ))}
        </div>
        <h1 className="display" style={{ fontSize: 32, lineHeight: 1.1 }}>
          {r.stars === 3 ? 'Module maîtrisé !' : r.stars === 2 ? 'Bien ancré !' : 'À consolider'}
        </h1>
        <p className="muted" style={{ fontSize: 16 }}>
          {r.correct} bonne{r.correct > 1 ? 's' : ''} réponse{r.correct > 1 ? 's' : ''} sur {r.total}
        </p>
        {r.gained > 0 && (
          <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 400, damping: 14 }} className="chip" style={{ background: 'var(--butter)', color: 'var(--butter-ink)' }}>
            +{r.gained} étoile{r.gained > 1 ? 's' : ''}
          </motion.span>
        )}
        {r.gained === 0 && r.best_stars > r.stars && <p className="muted" style={{ fontSize: 14 }}>Ton meilleur score reste {r.best_stars} étoiles.</p>}
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <Button variant="dark" onClick={onBack}>Retour au parcours</Button>
          {r.stars < 3 && <Button variant="soft" onClick={onAgain}>Retenter avec d’autres questions</Button>}
        </div>
      </div>
    </Screen>
  )
}
