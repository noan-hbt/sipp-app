import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { ErrorNotice } from '../components/ErrorNotice'
import { RichText } from '../components/RichText'
import { Screen } from '../components/Screen'
import { SipIcon } from '../components/SipIcon'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, apiErrorMessage, type Concept } from '../lib/api'
import { haptic, play } from '../lib/sound'
import { track } from '../lib/telemetry'

function ago(iso: string) {
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000))
  return days === 0 ? 'aujourd’hui' : days === 1 ? 'hier' : `il y a ${days} jours`
}

/** Two other notions' definitions next to the right one, same Sip first. Stable for a card. */
function choicesFor(card: Concept, all: Concept[]): { id: string; text: string }[] | null {
  const others = all.filter((c) => c.id !== card.id && c.definition !== card.definition)
  const ranked = [...others.filter((c) => c.sip_id === card.sip_id), ...others.filter((c) => c.sip_id !== card.sip_id)]
  if (ranked.length < 2) return null
  // Deterministic shuffle: the same card always shows its options in the same order.
  let seed = [...card.id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
  const pool = ranked.slice(0, 6).sort(() => rand() - 0.5).slice(0, 2)
  return [card, ...pool].map((c) => ({ id: c.id, text: c.definition })).sort(() => rand() - 0.5)
}

/** Today's spaced review: recall the notion, reveal it, say honestly whether you knew it. */
export function Review() {
  const nav = useNavigate()
  const qc = useQueryClient()
  // The session's cards are fixed once loaded, even as answers move them out of "due".
  const session = useQuery({ queryKey: ['review-session'], queryFn: Api.review, staleTime: Infinity, gcTime: 0 })
  const stats = useQuery({ queryKey: ['stats'], queryFn: Api.stats })
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(false)
  const [knew, setKnew] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const concepts = useQuery({ queryKey: ['concepts'], queryFn: Api.concepts })
  const saving = useRef(false)
  const answer = useMutation({
    networkMode: 'always',
    mutationFn: ({ id, k }: { id: string; k: boolean }) => Api.reviewCard(id, k),
    onSuccess: (_, { k }) => {
      track('card_reviewed', { knew: k })
      play(k ? 'correct' : 'tap')
      haptic(k ? 12 : 6)
      if (k) setKnew((n) => n + 1)
      setShown(false)
      setPicked(null)
      setI((n) => n + 1)
    },
    onSettled: () => { saving.current = false },
  })

  const cards = session.data?.cards ?? []
  const card = cards[i]
  const finished = session.data && i >= cards.length
  // Every other card is a quick multiple choice: recognising beats nothing on a tired day.
  const choices = useMemo(() => (card && i % 2 === 1 && concepts.data ? choicesFor(card, concepts.data) : null), [card, i, concepts.data])
  const close = () => {
    void qc.invalidateQueries({ queryKey: ['concepts'] })
    void qc.invalidateQueries({ queryKey: ['review'] })
    nav(-1)
  }

  function rate(k: boolean) {
    if (!card || saving.current) return
    saving.current = true
    answer.mutate({ id: card.id, k })
  }

  if (!card && !finished) {
    return (
      <Screen kind="modal">
        <header className="topbar">
          <IconButton label="Quitter la révision" onClick={close}>{Icon.close}</IconButton>
        </header>
        <div style={{ flex: 1, display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 18, padding: '0 24px' }}>
          <Mascot mood={session.isError || session.isPaused ? 'oops' : 'think'} size={104} />
          {session.isError || session.isPaused || !session.isPending ? (
            <ErrorNotice message={apiErrorMessage(session.error, session.isPaused ? 'Tu es hors ligne. Réessaie quand tu es connecté.' : 'Tes cartes n’ont pas pu se charger. Réessaie.')} retry={() => void session.refetch()} busy={session.isFetching} />
          ) : <p className="muted">Je charge tes cartes…</p>}
        </div>
      </Screen>
    )
  }

  if (finished) {
    const empty = cards.length === 0
    const noNotions = empty && stats.data?.concepts === 0
    return (
      <Screen kind="fade">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0 32px', textAlign: 'center' }}>
          <motion.div initial={{ scale: 0, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
            <Mascot mood={empty ? 'hello' : 'bravo'} size={110} />
          </motion.div>
          <h1 className="title-xl">{empty ? (noNotions ? 'Pas encore de notions' : 'Rien à réviser') : 'Révision finie !'}</h1>
          <p className="muted" style={{ fontSize: 16, lineHeight: 1.45 }}>
            {empty
              ? noNotions
                ? 'Termine ta première leçon : je garderai ses notions clés et te les ferai réviser au bon moment.'
                : 'Tes notions sont encore fraîches. Je te les ressortirai au bon moment.'
              : `${knew} sur ${cards.length} déjà bien en tête. Les autres reviendront demain.`}
          </p>
        </div>
        <div className="bottom-bar">
          <Button onClick={close} sound="pop">
            {empty ? 'Retour' : 'Terminer'}
          </Button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen kind="modal">
      <header className="topbar">
        <IconButton label="Quitter la révision" onClick={close}>
          {Icon.close}
        </IconButton>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`, gap: 4 }}>
          {cards.map((c, j) => (
            <motion.span key={c.id} animate={{ background: j < i ? 'var(--primary)' : j === i ? 'var(--peach-soft)' : 'var(--track)' }} style={{ height: 8, borderRadius: 4 }} />
          ))}
        </div>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--faint)', minWidth: 34, textAlign: 'right' }}>
          {i + 1}/{cards.length}
        </span>
      </header>
      {(session.isError || session.isPaused) && <ErrorNotice message={apiErrorMessage(session.error, 'Tes cartes n’ont pas pu être actualisées. Réessaie.')} retry={() => void session.refetch()} busy={session.isFetching} />}

      <div style={{ padding: '10px 20px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 className="title-l" style={{ fontSize: 25 }}>
          {choices ? 'Quelle définition ?' : 'Tu te souviens ?'}
        </h1>
        <p className="muted" style={{ fontSize: 15 }}>
          Vue {ago(card.last_reviewed_at ?? card.learned_at)} dans « {card.sip_title} »
        </p>
      </div>

      <div style={{ flex: 1, padding: '18px 20px 0', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ position: 'relative', flex: 1, maxHeight: 480 }}>
          {i + 2 < cards.length && <span aria-hidden="true" style={{ position: 'absolute', left: 22, right: 22, top: 22, bottom: -14, borderRadius: 28, background: 'var(--bg-deep)' }} />}
          {i + 1 < cards.length && <span aria-hidden="true" style={{ position: 'absolute', left: 11, right: 11, top: 11, bottom: -7, borderRadius: 28, background: 'var(--peach-soft)' }} />}
          <AnimatePresence mode="popLayout">
            <motion.article
              key={card.id}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: -60, rotate: -4 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="scroll"
              style={{ position: 'absolute', inset: 0, borderRadius: 28, background: 'var(--surface)', padding: 22, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 6px 20px rgba(29,26,23,.06)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SipIcon text={card.sip_title} size={44} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--peach-ink)' }}>Notion</span>
              </div>
              <h2 className="display" style={{ fontSize: 30, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                <RichText text={card.name} />
              </h2>
              <div style={{ height: 1.5, background: 'var(--bg-deep)', flexShrink: 0 }} />
              {choices ? (
                <div role="radiogroup" aria-label="Choisis la bonne définition" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {choices.map((o) => {
                    const right = o.id === card.id
                    const state = !picked ? 'idle' : right ? 'right' : o.id === picked ? 'wrong' : 'idle'
                    return (
                      <motion.button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={picked === o.id}
                        disabled={!!picked}
                        whileTap={{ scale: 0.98 }}
                        animate={state === 'wrong' ? { x: [0, -6, 6, -3, 0] } : {}}
                        onClick={() => {
                          setPicked(o.id)
                          if (!right) play('wrong')
                          if (right) setTimeout(() => rate(true), 700)
                        }}
                        style={{
                          border: 'none', borderRadius: 18, padding: '12px 14px', textAlign: 'left', fontSize: 15, lineHeight: 1.4, fontWeight: 500, color: 'var(--ink)',
                          background: state === 'right' ? 'var(--mint)' : state === 'wrong' ? 'var(--rose)' : 'var(--bg-deep)',
                          boxShadow: state === 'right' ? 'inset 0 0 0 2.5px var(--mint-strong)' : state === 'wrong' ? 'inset 0 0 0 2.5px var(--coral)' : 'none',
                          opacity: picked && state === 'idle' ? 0.55 : 1,
                        }}
                      >
                        <RichText text={o.text} />
                      </motion.button>
                    )
                  })}
                </div>
              ) : (
              <AnimatePresence mode="wait" initial={false}>
                {shown ? (
                  <motion.div key="a" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p className="lx-lead">
                      <RichText text={card.definition} />
                    </p>
                    {card.explanation && (
                      <p className="lx-p" style={{ fontSize: 15 }}>
                        <RichText text={card.explanation} />
                      </p>
                    )}
                  </motion.div>
                ) : (
                  <motion.p key="q" exit={{ opacity: 0 }} className="lx-small" style={{ fontSize: 16 }}>
                    Dis-la avec tes mots dans ta tête, puis retourne la carte.
                  </motion.p>
                )}
              </AnimatePresence>
              )}
            </motion.article>
          </AnimatePresence>
        </div>
      </div>

      <div style={{ padding: '30px 16px calc(var(--safe-bottom) + 24px)' }}>
        {answer.isError && <ErrorNotice message={apiErrorMessage(answer.error, 'Ta réponse n’a pas été enregistrée. Réessaie.')} retry={() => rate(answer.variables!.k)} busy={answer.isPending} />}
        {choices ? (
          picked && picked !== card.id ? (
            <Button variant="soft" onClick={() => rate(false)} disabled={answer.isPending} style={{ background: 'var(--rose)', color: 'var(--rose-ink)', boxShadow: 'none' }}>
              Compris, je la reverrai
            </Button>
          ) : (
            <p className="muted" style={{ textAlign: 'center', fontSize: 14, minHeight: 56, display: 'grid', placeItems: 'center' }}>
              {picked ? 'Bien vu !' : 'Touche la bonne définition.'}
            </p>
          )
        ) : shown ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <Button variant="soft" onClick={() => rate(false)} disabled={answer.isPending} style={{ background: 'var(--rose)', color: 'var(--rose-ink)', boxShadow: 'none' }}>
              À revoir
            </Button>
            <Button variant="mint" onClick={() => rate(true)} disabled={answer.isPending}>
              {Icon.check(18)} Je savais
            </Button>
          </div>
        ) : (
          <Button
            variant="dark"
            onClick={() => {
              play('reveal')
              setShown(true)
            }}
          >
            Retourner la carte
          </Button>
        )}
      </div>
    </Screen>
  )
}
