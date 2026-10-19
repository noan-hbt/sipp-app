import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { t } from '../lib/i18n'

function ago(iso: string) {
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000))
  return t.review.ago(days)
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
  // ?n=3: a quick round of a few cards from the home screen.
  const limit = Number(useSearchParams()[0].get('n')) || undefined
  const qc = useQueryClient()
  // The session's cards are fixed once loaded, even as answers move them out of "due".
  const session = useQuery({ queryKey: ['review-session'], queryFn: Api.review, staleTime: Infinity, gcTime: 0 })
  const stats = useQuery({ queryKey: ['stats'], queryFn: Api.stats })
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(false)
  const [results, setResults] = useState<boolean[]>([])
  const [leaving, setLeaving] = useState<boolean | null>(null)
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
      setResults((r) => [...r, k])
      setLeaving(null)
      setShown(false)
      setPicked(null)
      setI((n) => n + 1)
    },
    onError: () => setLeaving(null),
    onSettled: () => { saving.current = false },
  })

  const knew = results.filter(Boolean).length
  const allCards = session.data?.cards ?? []
  const cards = limit ? allCards.slice(0, limit) : allCards
  const left = allCards.length - cards.length
  const card = cards[i]
  const finished = session.data && i >= cards.length
  // Every other card is a quick multiple choice: recognising beats nothing on a tired day.
  const choices = useMemo(() => (card && i % 2 === 1 && Array.isArray(concepts.data) ? choicesFor(card, concepts.data) : null), [card, i, concepts.data])
  const close = () => {
    void qc.invalidateQueries({ queryKey: ['concepts'] })
    void qc.invalidateQueries({ queryKey: ['review'] })
    nav(-1)
  }

  function flip() {
    play('reveal')
    haptic(6)
    setShown(true)
  }

  function rate(k: boolean) {
    if (!card || saving.current) return
    saving.current = true
    if (!choices) setLeaving(k)
    answer.mutate({ id: card.id, k })
  }

  if (!card && !finished) {
    return (
      <Screen kind="modal">
        <header className="topbar">
          <IconButton label={t.review.quit} onClick={close}>{Icon.close}</IconButton>
        </header>
        <div style={{ flex: 1, display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 18, padding: '0 24px' }}>
          <Mascot mood={session.isError || session.isPaused ? 'oops' : 'think'} size={104} />
          {session.isError || session.isPaused || !session.isPending ? (
            <ErrorNotice message={apiErrorMessage(session.error, session.isPaused ? t.generating.offline : t.review.loadFailed)} retry={() => void session.refetch()} busy={session.isFetching} />
          ) : <p className="muted">{t.review.loading}</p>}
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
          {!empty && (
            <div aria-hidden="true" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, maxWidth: 260 }}>
              {results.map((k, n) => (
                <motion.span
                  key={n}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5 + n * 0.06, type: 'spring', stiffness: 420, damping: 16 }}
                  style={{ width: 22, height: 22, borderRadius: 11, display: 'grid', placeItems: 'center', background: k ? 'var(--mint-lip)' : 'var(--surface)', color: k ? '#fff' : 'var(--rose-ink)' }}
                >
                  {k ? Icon.check(12) : <span style={{ width: 6, height: 6, borderRadius: 3, background: 'currentColor' }} />}
                </motion.span>
              ))}
            </div>
          )}
          <h1 className="title-xl">{empty ? (noNotions ? t.review.noNotions : t.review.nothing) : t.review.done}</h1>
          <p className="muted" style={{ fontSize: 16, lineHeight: 1.45 }}>
            {empty
              ? noNotions
                ? t.review.noNotionsBody
                : t.review.nothingBody
              : t.review.doneBody(knew, cards.length, left)}
          </p>
        </div>
        <div className="bottom-bar">
          <Button onClick={close} sound="pop">
            {empty ? t.common.back : t.review.finish}
          </Button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen kind="modal" bg="var(--lavender)">
      <header className="topbar">
        <IconButton label={t.review.quit} onClick={close}>
          {Icon.close}
        </IconButton>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="kicker" style={{ color: 'var(--lavender-ink)' }}>
            {t.review.counter(i + 1, cards.length)}
          </span>
          <span style={{ display: 'flex' }}>
            <LiquidBar value={i / cards.length} height={8} color="var(--lavender-ink)" track="var(--frost)" delay={0} label={t.review.progress} />
          </span>
        </div>
      </header>
      {(session.isError || session.isPaused) && <ErrorNotice message={apiErrorMessage(session.error, t.review.refreshFailed)} retry={() => void session.refetch()} busy={session.isFetching} />}

      <div style={{ flex: 1, padding: '30px 22px 0', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ position: 'relative', flex: 1, maxHeight: 520, perspective: 1400 }}>
          {i + 2 < cards.length && <span aria-hidden="true" style={{ position: 'absolute', left: 18, right: 18, top: -16, bottom: 26, borderRadius: 32, background: 'var(--lavender-strong)', transform: 'rotate(4deg)' }} />}
          {i + 1 < cards.length && <span aria-hidden="true" style={{ position: 'absolute', left: 8, right: 8, top: -8, bottom: 16, borderRadius: 32, background: 'var(--surface)', opacity: 0.6, transform: 'rotate(-3deg)' }} />}
          <AnimatePresence initial={false}>
            <FlashCard
              key={card.id}
              card={card}
              choices={choices}
              shown={shown}
              leaving={leaving}
              picked={picked}
              onFlip={flip}
              onPick={(id) => {
                setPicked(id)
                if (id !== card.id) play('wrong')
                else setTimeout(() => rate(true), 700)
              }}
              onRate={rate}
            />
          </AnimatePresence>
        </div>
      </div>

      <div style={{ padding: '30px 16px calc(var(--safe-bottom) + 24px)' }}>
        {answer.isError && <ErrorNotice message={apiErrorMessage(answer.error, t.review.answerFailed)} retry={() => rate(answer.variables!.k)} busy={answer.isPending} />}
        {choices ? (
          picked && picked !== card.id ? (
            <Button variant="soft" onClick={() => rate(false)} disabled={answer.isPending} style={{ background: 'var(--rose)', color: 'var(--rose-ink)', boxShadow: 'none' }}>
              {t.review.gotIt}
            </Button>
          ) : (
            <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--lavender-ink)', minHeight: 56, display: 'grid', placeItems: 'center' }}>
              {picked ? t.review.right : t.review.tapRight}
            </p>
          )
        ) : shown ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <Button variant="soft" onClick={() => rate(false)} disabled={answer.isPending || leaving !== null} style={{ height: 62, borderRadius: 31, color: 'var(--rose-ink)', boxShadow: 'none' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
              </svg>
              {t.notebook.due}
            </Button>
            <Button variant="mint" onClick={() => rate(true)} disabled={answer.isPending || leaving !== null} style={{ height: 62, borderRadius: 31 }}>
              {Icon.check(18)} {t.review.knew}
            </Button>
          </div>
        ) : (
          <Button onClick={flip} style={{ height: 62, borderRadius: 31 }}>
            {t.review.flip}
          </Button>
        )}
      </div>
    </Screen>
  )
}

const face: CSSProperties = {
  position: 'absolute', inset: 0, borderRadius: 32, background: 'var(--surface)', padding: 22,
  display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 20px 40px rgba(46,38,96,.14)',
  backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
}

const stamp: CSSProperties = { height: 34, padding: '0 14px', borderRadius: 17, display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: 14 }

/** One notion card: tap to flip it over, then swipe right if you knew it, left to see it again. */
function FlashCard({ card, choices, shown, leaving, picked, onFlip, onPick, onRate }: {
  card: Concept
  choices: { id: string; text: string }[] | null
  shown: boolean
  leaving: boolean | null
  picked: string | null
  onFlip: () => void
  onPick: (id: string) => void
  onRate: (knew: boolean) => void
}) {
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-14, 14])
  const yes = useTransform(x, [20, 110], [0, 1])
  const no = useTransform(x, [-110, -20], [1, 0])
  const [ticked, setTicked] = useState(false)
  useEffect(() => {
    const c = animate(x, leaving === null ? 0 : leaving ? 520 : -520, { type: 'spring', stiffness: 160, damping: 22 })
    return () => c.stop()
  }, [leaving]) // eslint-disable-line react-hooks/exhaustive-deps
  const canSwipe = shown && !choices && leaving === null
  const meta = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <img src={topicArt(card.sip_title)} alt="" width={30} height={30} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.3 }}>
        {card.sip_title} · {t.review.seen(ago(card.last_reviewed_at ?? card.learned_at))}
      </span>
    </div>
  )
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      drag={canSwipe ? 'x' : false}
      dragSnapToOrigin
      dragElastic={0.9}
      whileDrag={{ scale: 1.03 }}
      onDrag={(_, d) => {
        const past = Math.abs(d.offset.x) > 100
        if (past !== ticked) {
          setTicked(past)
          if (past) haptic(6)
        }
      }}
      onDragEnd={(_, d) => {
        setTicked(false)
        if (Math.abs(d.offset.x) > 100 || Math.abs(d.velocity.x) > 600) onRate(d.offset.x > 0)
      }}
      style={{ x, rotate, position: 'absolute', inset: '0 0 8px', touchAction: 'pan-y', cursor: canSwipe ? 'grab' : 'default' }}
    >
      <motion.div
        animate={{ rotateY: shown && !choices ? 180 : 0 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 24 }}
        style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}
      >
        {choices ? (
          <article className="scroll" style={face}>
            {meta}
            <span className="kicker" style={{ color: 'var(--lavender-ink)' }}>{t.review.which}</span>
            <h1 className="display" style={{ fontSize: 34, lineHeight: 1.02, letterSpacing: '-0.04em' }}>
              <RichText text={card.name} />
            </h1>
            <div role="radiogroup" aria-label={t.review.pick} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                    onClick={() => onPick(o.id)}
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
          </article>
        ) : (
          <>
            <article aria-hidden={shown} onClick={shown ? undefined : onFlip} style={{ ...face, cursor: shown ? 'default' : 'pointer' }}>
              {meta}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center' }}>
                <motion.img
                  src={topicArt(card.sip_title)}
                  alt=""
                  width={128}
                  height={128}
                  draggable={false}
                  animate={reduce ? {} : { y: [0, -6, 0] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span className="kicker" style={{ color: 'var(--lavender-ink)' }}>{t.review.remember}</span>
                <h1 className="display" style={{ fontSize: 34, lineHeight: 1.02, letterSpacing: '-0.04em' }}>
                  <RichText text={card.name} />
                </h1>
              </div>
              <span style={{ fontSize: 14, color: 'var(--faint)', textAlign: 'center' }}>{t.review.sayIt}</span>
            </article>
            <article aria-hidden={!shown} className="scroll" style={{ ...face, transform: 'rotateY(180deg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', minHeight: 34 }}>
                <motion.span style={{ ...stamp, opacity: no, rotate: -10, background: 'var(--rose)', color: 'var(--rose-ink)' }}>{t.review.stampNo}</motion.span>
                <motion.span style={{ ...stamp, opacity: yes, rotate: 10, background: 'var(--mint)', color: 'var(--mint-ink)' }}>{t.review.stampYes}</motion.span>
              </div>
              <h2 className="display" style={{ fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.035em' }}>
                <RichText text={card.name} />
              </h2>
              <p className="lx-lead">
                <RichText text={card.definition} />
              </p>
              {card.explanation && (
                <p className="lx-p" style={{ fontSize: 15 }}>
                  <RichText text={card.explanation} />
                </p>
              )}
              <span style={{ marginTop: 'auto', fontSize: 13, color: 'var(--faint)', textAlign: 'center' }}>{t.review.swipeHint}</span>
            </article>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
