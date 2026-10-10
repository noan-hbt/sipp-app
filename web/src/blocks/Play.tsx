import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, useState } from 'react'
import { Mascot } from '../components/Mascot'
import { CountUp } from '../components/motion'
import { RichText } from '../components/RichText'
import { Button, Icon } from '../components/ui'
import type * as B from '../lib/blocks'
import { plain } from '../lib/blocks'
import { haptic, play } from '../lib/sound'
import type { Answer } from './Blocks'
import { Kicker } from './Kicker'

const fmt = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const compact = (v: number) => v.toLocaleString('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })
const withUnit = (v: string, unit?: string | null) => (unit ? `${v} ${unit}` : v)

// --- Hook: the question the lesson answers ------------------------------------------

/** Full-bleed opening on caramel (the player paints the screen): the art, then the question word by word. */
export function Hook({ b, title, art }: { b: B.HookBlock; title?: string; art?: string }) {
  const reduce = useReducedMotion()
  const words = b.question.split(/\s+/)
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14, color: '#fff', minHeight: '100%' }}>
      <div style={{ position: 'relative', height: 250, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <motion.span
          aria-hidden="true"
          initial={reduce ? false : { scale: 0.2 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 120, damping: 14 }}
          style={{ position: 'absolute', width: 250, height: 250, borderRadius: 125, background: '#e5763f' }}
        />
        <motion.div
          initial={reduce ? false : { scale: 0.3, rotate: -16, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.15 }}
          style={{ position: 'relative', display: 'grid' }}
        >
          {art ? <img src={art} alt="" width={220} height={220} draggable={false} /> : <Mascot mood="think" size={170} />}
        </motion.div>
      </div>
      {title && (
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="kicker" style={{ color: '#fff0c2' }}>
          {title}
        </motion.span>
      )}
      <h2 className="display" style={{ fontSize: 34, lineHeight: 1.04, letterSpacing: '-0.04em' }} aria-label={b.question}>
        {words.map((w, i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            initial={reduce ? false : { opacity: 0, y: 18, rotate: 4 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22, delay: 0.35 + i * 0.045 }}
            style={{ display: 'inline-block', marginRight: '0.24em' }}
          >
            {plain(w)}
          </motion.span>
        ))}
      </h2>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 + words.length * 0.045 }}
        style={{ fontSize: 16, lineHeight: 1.45, color: 'rgba(255,255,255,.88)' }}
      >
        <RichText text={b.teaser} />
      </motion.p>
    </section>
  )
}

/** The hook's question, answered: opens the recap. */
export function HookSolved({ b }: { b: B.HookBlock }) {
  return (
    <motion.section
      initial={{ scale: 0.9, opacity: 0, rotate: -2 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      style={{ borderRadius: 26, background: '#d9622b', color: '#fff', padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <span className="kicker" style={{ color: '#fff0c2', display: 'flex', alignItems: 'center', gap: 6 }}>
        {Icon.check(13, '#fff0c2')}
        Question du début : résolue
      </span>
      <span style={{ fontSize: 14, color: 'rgba(255,255,255,.8)' }}>
        <RichText text={b.question} />
      </span>
      <span className="display" style={{ fontSize: 21, lineHeight: 1.15, letterSpacing: '-0.03em' }}>
        <RichText text={b.answer} />
      </span>
    </motion.section>
  )
}

// --- Predict: bet first, then the truth -----------------------------------------------

export function Predict({ b, answer, onAnswer }: { b: B.PredictBlock; answer?: Answer; onAnswer: (a: Answer) => void }) {
  return b.kind === 'number' ? <PredictNumber b={b} answer={answer} onAnswer={onAnswer} /> : <PredictChoice b={b} answer={answer} onAnswer={onAnswer} />
}

function PredictHeader({ b }: { b: B.PredictBlock }) {
  return (
    <>
      <Kicker icon="question" tone="lavender">
        Parie d’abord
      </Kicker>
      <h2 className="display" style={{ fontSize: 26, lineHeight: 1.1, letterSpacing: '-0.035em' }}>
        <RichText text={b.prompt} />
      </h2>
      <p className="lx-small">Pas de mauvaise réponse : on compare juste avec ton intuition.</p>
    </>
  )
}

function Reveal({ text, delay }: { text: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay }}
      style={{ borderRadius: 22, background: 'var(--surface)', padding: '14px 16px', fontSize: 16, lineHeight: 1.5 }}
    >
      <RichText text={text} />
    </motion.div>
  )
}

function PredictNumber({ b, answer, onAnswer }: { b: B.PredictBlock; answer?: Answer; onAnswer: (a: Answer) => void }) {
  const min = b.min ?? 0
  const max = b.max ?? 100
  const step = b.step ?? 1
  const truth = b.answer ?? 0
  const snap = (v: number) => Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step))
  // Start on the side away from the truth: an untouched bet is still a real guess.
  const [value, setValue] = useState(() => snap(truth > (min + max) / 2 ? min + (max - min) * 0.2 : min + (max - min) * 0.8))
  const answered = !!answer
  const bet = answered ? (answer!.value as number) : value
  const pct = (v: number) => ((v - min) / (max - min)) * 100
  const gap = Math.abs(bet - truth)
  const close = gap <= (max - min) * 0.05

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PredictHeader b={b} />
      <div style={{ borderRadius: 28, background: 'var(--lavender)', padding: '22px 18px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 4 }}>
        <AnimatePresence mode="wait" initial={false}>
          {answered ? (
            <motion.div key="truth" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span className="kicker" style={{ color: 'var(--lavender-ink)' }}>La vraie réponse</span>
              <span className="display" style={{ fontSize: 50, lineHeight: 1, letterSpacing: '-0.05em', color: 'var(--ink)' }}>
                <CountUp value={truth} duration={1.1} format={(n) => withUnit(fmt(snap(n)), b.unit)} />
              </span>
            </motion.div>
          ) : (
            <motion.span key="bet" exit={{ scale: 0.8, opacity: 0 }} className="display" style={{ fontSize: 50, lineHeight: 1, letterSpacing: '-0.05em', color: 'var(--lavender-ink)' }}>
              {withUnit(fmt(value), b.unit)}
            </motion.span>
          )}
        </AnimatePresence>
        <div style={{ position: 'relative', width: '100%', height: 40 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 14, height: 12, borderRadius: 6, background: 'var(--surface)' }} />
          <motion.div animate={{ width: `${pct(bet)}%` }} transition={{ type: 'spring', stiffness: 500, damping: 40 }} style={{ position: 'absolute', left: 0, top: 14, height: 12, borderRadius: 6, background: 'var(--lavender-ink)', opacity: answered ? 0.35 : 1 }} />
          <motion.span
            animate={{ left: `${pct(bet)}%`, scale: answered ? 0.8 : 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            style={{ position: 'absolute', top: 5, width: 30, height: 30, marginLeft: -15, borderRadius: 15, background: 'var(--surface)', boxShadow: '0 0 0 5px var(--lavender-ink)', pointerEvents: 'none' }}
          />
          {answered && (
            <motion.span
              initial={{ left: `${pct(bet)}%`, opacity: 0, scale: 0 }}
              animate={{ left: `${pct(truth)}%`, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.15 }}
              style={{ position: 'absolute', top: 2, width: 36, height: 36, marginLeft: -18, borderRadius: 18, background: 'var(--primary)', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 4px var(--lavender)' }}
            >
              {Icon.check(16, '#fff')}
            </motion.span>
          )}
          {!answered && (
            <input
              type="range"
              aria-label="Ton pari"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Math.round((v - min) / step) % Math.max(1, Math.round((max - min) / step / 20)) === 0) haptic(4)
                setValue(v)
              }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, margin: 0, cursor: 'grab' }}
            />
          )}
        </div>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--lavender-ink)' }}>
          <span>{withUnit(fmt(min), b.unit)}</span>
          <span>{withUnit(fmt(max), b.unit)}</span>
        </div>
        {answered && (
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            style={{ height: 32, padding: '0 14px', borderRadius: 16, background: 'var(--surface)', display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700, color: close ? 'var(--mint-ink)' : 'var(--lavender-ink)' }}
          >
            {close ? `Pile dans le mille avec ${withUnit(fmt(bet), b.unit)} !` : `Ton pari : ${withUnit(fmt(bet), b.unit)} · écart de ${withUnit(fmt(snap(gap + min) - min), b.unit)}`}
          </motion.span>
        )}
      </div>
      {answered ? (
        <Reveal text={b.reveal} delay={1.1} />
      ) : (
        <Button
          onClick={() => {
            const near = Math.abs(value - truth) <= (max - min) * 0.05
            play(near ? 'star' : 'reveal')
            haptic(near ? 20 : 10)
            onAnswer({ correct: null, value })
          }}
        >
          Je parie {withUnit(fmt(value), b.unit)}
        </Button>
      )}
    </section>
  )
}

function PredictChoice({ b, answer, onAnswer }: { b: B.PredictBlock; answer?: Answer; onAnswer: (a: Answer) => void }) {
  const picked = answer ? (answer.value as string) : null
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PredictHeader b={b} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        {(b.options ?? []).map((o, i) => {
          const truth = o.id === b.answer_id
          const mine = o.id === picked
          const bg = !picked ? 'var(--surface)' : truth ? 'var(--mint)' : mine ? 'var(--lavender)' : 'var(--surface)'
          return (
            <motion.button
              key={o.id}
              type="button"
              disabled={!!picked}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: picked && !truth && !mine ? 0.45 : 1, y: 0, scale: picked && truth ? [1, 1.04, 1] : 1 }}
              transition={{ delay: picked ? (truth ? 0.25 : 0) : 0.1 + i * 0.06, duration: picked && truth ? 0.5 : undefined }}
              whileTap={picked ? undefined : { scale: 0.97 }}
              onClick={() => {
                play(o.id === b.answer_id ? 'star' : 'reveal')
                haptic(12)
                onAnswer({ correct: null, value: o.id })
              }}
              style={{ minHeight: 58, border: 'none', borderRadius: 20, padding: '12px 16px', textAlign: 'left', fontSize: 16, fontWeight: 600, background: bg, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <span style={{ flex: 1 }}>
                <RichText text={o.text} />
              </span>
              {picked && truth && <span style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--mint-strong)', display: 'grid', placeItems: 'center' }}>{Icon.check(14, '#fff')}</span>}
              {picked && mine && !truth && <span className="kicker" style={{ color: 'var(--lavender-ink)' }}>Ton pari</span>}
            </motion.button>
          )
        })}
      </div>
      {picked && <Reveal text={b.reveal} delay={0.45} />}
    </section>
  )
}

// --- Swipe: quick true / false cards ---------------------------------------------------

export function Swipe({ b, answer, onAnswer, onCheck }: { b: B.SwipeBlock; answer?: Answer; onAnswer: (a: Answer) => void; onCheck?: (ok: boolean) => void }) {
  const [picks, setPicks] = useState<boolean[]>(() => (answer ? (answer.value as boolean[]) : []))
  const [showing, setShowing] = useState<boolean | null>(null)
  const done = !!answer
  const index = picks.length - (showing !== null ? 1 : 0)
  const card = b.cards[index]

  function decide(v: boolean) {
    if (showing !== null || done || !card) return
    const ok = v === card.is_true
    play(ok ? 'correct' : 'wrong')
    haptic(ok ? 12 : 30)
    onCheck?.(ok)
    setPicks((p) => [...p, v])
    setShowing(v)
  }
  function nextCard() {
    setShowing(null)
    if (picks.length >= b.cards.length) {
      const right = b.cards.filter((c, i) => picks[i] === c.is_true).length
      onAnswer({ correct: right === b.cards.length, value: picks })
    } else play('whoosh')
  }

  if (done) {
    const right = b.cards.filter((c, i) => picks[i] === c.is_true).length
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Kicker icon="myth" tone="lavender">
          Vrai ou faux
        </Kicker>
        <h2 className="display" style={{ fontSize: 30, letterSpacing: '-0.04em' }}>
          {right === b.cards.length ? 'Sans faute !' : `${right} sur ${b.cards.length}`}
        </h2>
        {b.cards.map((c, i) => {
          const ok = picks[i] === c.is_true
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              style={{ borderRadius: 20, background: 'var(--surface)', padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}
            >
              <span style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, background: ok ? 'var(--mint-strong)' : 'var(--rose-ink)', display: 'grid', placeItems: 'center', color: '#fff' }}>
                {ok ? Icon.check(13, '#fff') : '✕'}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  <RichText text={c.statement} /> <b style={{ color: c.is_true ? 'var(--mint-ink)' : 'var(--rose-ink)' }}>{c.is_true ? 'Vrai' : 'Faux'}</b>
                </span>
                <span className="lx-small">
                  <RichText text={c.why} />
                </span>
              </span>
            </motion.div>
          )
        })}
      </section>
    )
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Kicker icon="myth" tone="lavender">
          {b.prompt ?? 'Vrai ou faux ? Swipe'}
        </Kicker>
        <span className="kicker" style={{ color: 'var(--lavender-ink)' }}>
          {Math.min(picks.length + (showing === null ? 1 : 0), b.cards.length)} / {b.cards.length}
        </span>
      </div>
      <div style={{ position: 'relative', height: 330, marginTop: 6 }}>
        {b.cards.slice(index + 1, index + 3).reverse().map((_, j, arr) => {
          const depth = arr.length - j
          return (
            <motion.div
              key={index + depth}
              animate={{ rotate: depth === 1 ? -3 : 5, scale: 1 - depth * 0.04, y: depth * 8 }}
              style={{ position: 'absolute', inset: 0, borderRadius: 32, background: depth === 1 ? 'color-mix(in srgb, var(--surface) 70%, var(--lavender))' : 'color-mix(in srgb, var(--surface) 40%, var(--lavender))' }}
            />
          )
        })}
        <AnimatePresence>
          {card && (
            <SwipeCard
              key={index}
              card={card}
              result={showing}
              onDecide={decide}
            />
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence mode="wait">
        {showing !== null && card ? (
          <motion.div
            key={`r${index}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{ borderRadius: 22, padding: '14px 16px', background: showing === card.is_true ? '#23875a' : '#c8452f', color: '#fff', display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <span className="display" style={{ fontSize: 20 }}>
              {showing === card.is_true ? 'Bien vu !' : card.is_true ? 'Eh non, c’est vrai' : 'Eh non, c’est faux'}
            </span>
            <span style={{ fontSize: 15, lineHeight: 1.45, color: 'rgba(255,255,255,.9)' }}>
              <RichText text={card.why} />
            </span>
            <Button onClick={nextCard} style={{ background: '#fff', color: showing === card.is_true ? '#1a6a46' : '#9b2f1d' }}>
              {picks.length >= b.cards.length ? 'Voir le bilan' : 'Carte suivante'}
            </Button>
          </motion.div>
        ) : (
          <motion.div key="btns" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', justifyContent: 'center', gap: 28 }}>
            {[false, true].map((v) => (
              <motion.button
                key={String(v)}
                type="button"
                aria-label={v ? 'Vrai' : 'Faux'}
                whileTap={{ scale: 0.86 }}
                whileHover={{ scale: 1.06 }}
                onClick={() => decide(v)}
                style={{ width: 72, height: 72, borderRadius: 36, border: 'none', background: 'var(--surface)', color: v ? '#23875a' : '#c8452f', display: 'grid', placeItems: 'center', boxShadow: '0 10px 24px rgba(46,38,96,.12)' }}
              >
                {v ? Icon.check(28, '#23875a') : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** The top card: follows the finger, tilts, shows VRAI / FAUX as it leans, flies off on release. */
function SwipeCard({ card, result, onDecide }: { card: B.SwipeBlock['cards'][number]; result: boolean | null; onDecide: (v: boolean) => void }) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-14, 14])
  const yes = useTransform(x, [20, 110], [0, 1])
  const no = useTransform(x, [-110, -20], [1, 0])
  const [ticked, setTicked] = useState(false)
  useEffect(() => {
    if (result === null) return
    const c = animate(x, result ? 520 : -520, { type: 'spring', stiffness: 160, damping: 22 })
    return () => c.stop()
  }, [result]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.div
      drag={result === null ? 'x' : false}
      dragSnapToOrigin
      dragElastic={0.9}
      style={{ x, rotate, position: 'absolute', inset: 0, borderRadius: 32, background: 'var(--surface)', padding: '24px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 20px 40px rgba(46,38,96,.16)', cursor: result === null ? 'grab' : 'default', touchAction: 'pan-y' }}
      initial={{ scale: 0.92, opacity: 0, y: 16 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      whileDrag={{ scale: 1.03, cursor: 'grabbing' }}
      onDrag={(_, i) => {
        const past = Math.abs(i.offset.x) > 100
        if (past !== ticked) {
          setTicked(past)
          if (past) haptic(6)
        }
      }}
      onDragEnd={(_, i) => {
        setTicked(false)
        if (Math.abs(i.offset.x) > 100 || Math.abs(i.velocity.x) > 600) onDecide(i.offset.x > 0)
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <motion.span style={{ opacity: no, rotate: -10, height: 34, padding: '0 14px', borderRadius: 17, background: 'var(--rose)', color: 'var(--rose-ink)', display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: 14 }}>FAUX</motion.span>
        <motion.span style={{ opacity: yes, rotate: 10, height: 34, padding: '0 14px', borderRadius: 17, background: 'var(--mint)', color: 'var(--mint-ink)', display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: 14 }}>VRAI</motion.span>
      </div>
      <span className="display" style={{ fontSize: 25, lineHeight: 1.12, letterSpacing: '-0.03em' }}>
        <RichText text={card.statement} />
      </span>
      <span style={{ fontSize: 13, color: 'var(--faint)' }}>Glisse à gauche si c’est faux, à droite si c’est vrai.</span>
    </motion.div>
  )
}

// --- Simulate: one knob, one result -----------------------------------------------------

export function Simulate({ b }: { b: B.SimulateBlock }) {
  const [i, setI] = useState(() => Math.min(b.start ?? 0, b.points.length - 1))
  const [moved, setMoved] = useState(false)
  // The takeaway comes once the learner has played, or after a moment for those who don't.
  const [late, setLate] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLate(true), 4000)
    return () => clearTimeout(t)
  }, [])
  const top = Math.max(...b.points.map((p) => p.y), 1)
  const p = b.points[i]
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Kicker icon="estimate" tone="mint">
        Joue avec
      </Kicker>
      <h2 className="display" style={{ fontSize: 26, lineHeight: 1.1, letterSpacing: '-0.035em' }}>
        <RichText text={b.prompt} />
      </h2>
      <div style={{ borderRadius: 28, background: 'var(--surface)', padding: '18px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="kicker" style={{ color: 'var(--muted)' }}>{b.output}</span>
          <span className="display" style={{ fontSize: 40, lineHeight: 1, letterSpacing: '-0.05em', color: 'var(--primary)' }}>
            <CountUp value={p.y} duration={0.6} format={(n) => withUnit(fmt(Math.round(n)), b.output_unit)} />
          </span>
        </div>
        <div style={{ height: 170, display: 'flex', alignItems: 'flex-end', gap: 8 }} aria-hidden="true">
          {b.points.map((q, k) => {
            const on = k === i
            return (
              <button
                key={k}
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setI(k)
                  setMoved(true)
                  play('tap')
                  haptic(6)
                }}
                style={{ flex: 1, height: '100%', border: 'none', background: 'none', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}
              >
                <motion.span animate={{ scale: on ? 1.08 : 1 }} style={{ fontSize: 12, fontWeight: 800, color: on ? 'var(--primary)' : 'var(--faint)' }}>
                  {compact(q.y)}
                </motion.span>
                <motion.span
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(6, (q.y / top) * 120)}px`, background: on ? 'var(--primary)' : 'var(--peach-soft)' }}
                  transition={{ type: 'spring', stiffness: 220, damping: 20, delay: moved ? 0 : 0.1 + k * 0.07 }}
                  style={{ width: '100%', borderRadius: 12 }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: on ? 'var(--ink)' : 'var(--faint)' }}>{withUnit(fmt(q.x), b.parameter_unit)}</span>
              </button>
            )
          })}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
            <span>{b.parameter}</span>
            <span style={{ color: 'var(--primary)' }}>{withUnit(fmt(p.x), b.parameter_unit)}</span>
          </span>
          <span style={{ position: 'relative', height: 32 }}>
            <span style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 12, borderRadius: 6, background: 'var(--bg-deep)' }} />
            <motion.span animate={{ width: `${(i / (b.points.length - 1)) * 100}%` }} style={{ position: 'absolute', left: 0, top: 10, height: 12, borderRadius: 6, background: 'var(--primary)' }} />
            <motion.span animate={{ left: `${(i / (b.points.length - 1)) * 100}%` }} transition={{ type: 'spring', stiffness: 500, damping: 32 }} style={{ position: 'absolute', top: 1, width: 30, height: 30, marginLeft: -15, borderRadius: 15, background: 'var(--surface)', boxShadow: '0 0 0 5px var(--primary)', pointerEvents: 'none' }} />
            <input
              type="range"
              aria-label={b.parameter}
              min={0}
              max={b.points.length - 1}
              step={1}
              value={i}
              aria-valuetext={`${withUnit(fmt(p.x), b.parameter_unit)} : ${withUnit(fmt(p.y), b.output_unit)}`}
              onChange={(e) => {
                setI(Number(e.target.value))
                setMoved(true)
                play('tap')
                haptic(6)
              }}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, margin: 0, cursor: 'pointer' }}
            />
          </span>
        </label>
      </div>
      <AnimatePresence>
        {(moved || late) && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            style={{ borderRadius: 22, background: 'var(--mint)', color: 'var(--mint-ink)', padding: '14px 16px', fontSize: 15, lineHeight: 1.45, fontWeight: 600 }}
          >
            <RichText text={b.takeaway} />
          </motion.div>
        )}
      </AnimatePresence>
      {!moved && !late && <p className="lx-small" style={{ textAlign: 'center' }}>Fais glisser pour voir ce qui change.</p>}
    </section>
  )
}
