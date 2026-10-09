import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Api, type Problem } from '../lib/api'
import { track } from '../lib/telemetry'
import { BottomSheet } from './BottomSheet'
import { Button } from './ui'

const PROBLEMS: [Problem, string][] = [
  ['wrong', 'Une erreur dans le contenu'],
  ['unclear', 'Ce n’est pas clair'],
  ['broken', 'Un exercice ne marche pas'],
  ['other', 'Autre chose'],
]

/** "Something is wrong with this lesson": kept on the server for review, counted in analytics. */
export function ReportSheet({ lessonId, block, open, onClose }: { lessonId: string; block?: number; open: boolean; onClose: () => void }) {
  const [problem, setProblem] = useState<Problem | null>(null)
  const [comment, setComment] = useState('')
  const send = useMutation({
    mutationFn: () => Api.feedback(lessonId, { problem: problem!, comment: comment.trim() || undefined, block }),
    onSuccess: () => track('lesson_reported', { problem, has_comment: !!comment.trim(), block: block ?? null }),
  })
  const close = () => {
    onClose()
    if (send.isSuccess) {
      setProblem(null)
      setComment('')
      send.reset()
    }
  }
  return (
    <BottomSheet open={open} label="Signaler un problème" busy={send.isPending} onClose={close}>
      {send.isSuccess ? (
        <>
          <h2 className="title-m">Merci, c’est noté</h2>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>Ton signalement m’aide à corriger mes leçons.</p>
          <Button data-autofocus variant="soft" onClick={close}>Fermer</Button>
        </>
      ) : (
        <>
          <h2 className="title-m">Qu’est-ce qui ne va pas ?</h2>
          <div role="radiogroup" aria-label="Type de problème" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PROBLEMS.map(([k, label]) => {
              const on = problem === k
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setProblem(k)}
                  style={{ border: 'none', borderRadius: 18, padding: '14px 16px', textAlign: 'left', fontSize: 16, fontWeight: 500, background: on ? 'var(--primary-soft)' : 'var(--surface)', color: 'var(--ink)', boxShadow: on ? 'inset 0 0 0 2.5px var(--primary)' : 'inset 0 0 0 2px var(--line)' }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="field">
            <label htmlFor="report-comment" style={{ color: 'var(--muted)' }}>Un détail ? (facultatif)</label>
            <textarea id="report-comment" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} style={{ resize: 'none' }} />
          </div>
          {send.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14 }}>L’envoi a échoué. Réessaie dans un instant.</p>}
          <Button disabled={!problem || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? 'Envoi…' : 'Envoyer'}
          </Button>
          <Button variant="ghost" onClick={close} disabled={send.isPending} style={{ height: 44, fontSize: 16 }}>Annuler</Button>
        </>
      )}
    </BottomSheet>
  )
}
