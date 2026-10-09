import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { ErrorNotice } from '../components/ErrorNotice'
import { RichText } from '../components/RichText'
import { CountUp, LiquidBar } from '../components/motion'
import { Screen } from '../components/Screen'
import { topicArt } from '../components/SipIcon'
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
      <Screen kind="fade" bg={empty ? undefined : 'var(--lavender)'}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0 32px', textAlign: 'center' }}>
          <motion.div initial={{ scale: 0, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
            <Mascot mood={empty ? 'hello' : 'bravo'} size={110} />
          </motion.div>
          {!empty && (
            <span className="hero-num" style={{ fontSize: 88 }}>
              <CountUp value={knew} delay={0.3} />
              <span style={{ fontSize: 44, color: 'var(--lavender-ink)' }}>/{cards.length}</span>
            </span>
          )}
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
    <Screen kind="modal" bg="var(--lavender)">
      <header className="topbar">
        <IconButton label="Quitter la révision" onClick={close}>
          {Icon.close}
        </IconButton>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="kicker" style={{ color: 'var(--lavender-ink)' }}>
            Révision · {i + 1} sur {cards.length}
          </span>
          <span style={{ display: 'flex' }}>
            <LiquidBar value={i / cards.length} height={8} color="var(--lavender-ink)" track="var(--frost)" delay={0} label="Avancement de la révision" />
          </span>
        </div>
      </header>
      {(session.isError || session.isPaused) && <ErrorNotice message={apiErrorMessage(session.error, 'Tes cartes n’ont pas pu être actualisées. Réessaie.')} retry={() => void session.refetch()} busy={session.isFetching} />}

      <div style={{ flex: 1, padding: '30px 22px 0', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ position: 'relative', flex: 1, maxHeight: 520 }}>
          {i + 2 < cards.length && <span aria-hidden="true" style={{ position: 'absolute', left: 18, right: 18, top: -16, bottom: 26, borderRadius: 32, background: 'var(--lavender-strong)', transform: 'rotate(4deg)' }} />}
          {i + 1 < cards.length && <span aria-hidden="true" style={{ position: 'absolute', left: 8, right: 8, top: -8, bottom: 16, borderRadius: 32, background: 'var(--surface)', opacity: 0.6, transform: 'rotate(-3deg)' }} />}
          <AnimatePresence mode="popLayout">
            <motion.article
              key={card.id}
              initial={{ opacity: 0, y: 30, scale: 0.92, rotate: 3 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, x: -140, rotate: -12 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className="scroll"
              style={{ position: 'absolute', inset: '0 0 8px', borderRadius: 32, background: 'var(--surface)', padding: 22, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 20px 40px rgba(46,38,96,.14)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src={topicArt(card.sip_title)} alt="" width={36} height={36} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.3 }}>
                  {card.sip_title} · vue {ago(card.last_reviewed_at ?? card.learned_at)}
                </span>
              </div>
              <span className="kicker" style={{ color: 'var(--lavender-ink)' }}>
                {choices ? 'Quelle définition ?' : 'Tu te souviens ?'}
              </span>
              <h1 className="display" style={{ fontSize: 34, lineHeight: 1.02, letterSpacing: '-0.04em' }}>
                <RichText text={card.name} />
              </h1>
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
                          border: 'none', borderRadius: 20, padding: '12px 14px', textAlign: 'left', fontSize: 15, lineHeight: 1.4, fontWeight: 500, color: 'var(--ink)',
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
                  <motion.div key="a" initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }} style={{ marginTop: 'auto', borderRadius: 22, background: 'var(--bg-deep)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span className="kicker" style={{ color: 'var(--faint)' }}>Réponse</span>
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
            <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--lavender-ink)', minHeight: 56, display: 'grid', placeItems: 'center' }}>
              {picked ? 'Bien vu !' : 'Touche la bonne définition.'}
            </p>
          )
        ) : shown ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <Button variant="soft" onClick={() => rate(false)} disabled={answer.isPending} style={{ height: 62, borderRadius: 31, color: 'var(--rose-ink)', boxShadow: 'none' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
              </svg>
              À revoir
            </Button>
            <Button variant="dark" onClick={() => rate(true)} disabled={answer.isPending} style={{ height: 62, borderRadius: 31 }}>
              {Icon.check(18)} Je savais
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => {
              play('reveal')
              setShown(true)
            }}
            style={{ height: 62, borderRadius: 31 }}
          >
            Retourner la carte
          </Button>
        )}
      </div>
    </Screen>
  )
}
