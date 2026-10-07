import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { RichText } from '../components/RichText'
import { Button } from '../components/ui'
import type * as B from '../lib/blocks'
import { haptic, play } from '../lib/sound'
import type { Answer } from './Blocks'

// Deterministic shuffle so a block always looks the same across re-renders/reloads.
function shuffled<T>(items: T[], seed: string): T[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) | 0
    const j = Math.abs(h) % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function grade(correct: boolean) {
  play(correct ? 'correct' : 'wrong')
  haptic(correct ? 12 : 30)
}

function Header({ tag, bg, ink, children }: { tag: string; bg: string; ink: string; children?: ReactNode }) {
  return (
    <>
      <span className="tag" style={{ background: bg, color: ink }}>
        {tag}
      </span>
      {children && <h2 style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.3 }}>{children}</h2>}
    </>
  )
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// --- Fill the blanks -------------------------------------------------------------

export function FillBlanks({ b, answer, onAnswer }: { b: B.FillBlanksBlock; answer?: Answer; onAnswer: (a: Answer) => void }) {
  const choices = useMemo(() => shuffled([...b.blanks.map((x) => x.answer), ...b.distractors], b.text), [b])
  const [filled, setFilled] = useState<(number | null)[]>(() => b.blanks.map(() => null))
  const answered = !!answer
  const values: string[] = answered ? (answer!.value as string[]) : filled.map((c) => (c === null ? '' : choices[c]))
  const parts = b.text.split(/\{(\d+)\}/)
  const complete = filled.every((c) => c !== null)

  const pick = (ci: number) => {
    const slot = filled.indexOf(null)
    if (slot === -1 || filled.includes(ci)) return
    play('tap')
    setFilled((f) => f.map((v, i) => (i === slot ? ci : v)))
  }
  const unpick = (slot: number) => {
    if (answered || filled[slot] === null) return
    play('tap')
    setFilled((f) => f.map((v, i) => (i === slot ? null : v)))
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Header tag="Complète" bg="var(--butter)" ink="var(--butter-ink)" />
      <p style={{ fontSize: 19, fontWeight: 700, lineHeight: 2.1 }}>
        {parts.map((part, i) => {
          if (i % 2 === 0) return <RichText key={i} text={part} />
          const slot = Number(part) - 1
          const v = values[slot]
          const ok = answered ? same(v, b.blanks[slot].answer) : null
          return (
            <motion.button
              key={i}
              onClick={() => unpick(slot)}
              disabled={answered || !v}
              layout
              animate={ok === false ? { x: [0, -6, 6, -3, 3, 0] } : ok ? { scale: [1, 1.08, 1] } : {}}
              transition={{ duration: 0.4 }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                verticalAlign: 'baseline',
                minWidth: 72,
                minHeight: 36,
                margin: '0 4px',
                padding: '2px 12px',
                borderRadius: 12,
                fontSize: 17,
                fontWeight: 900,
                justifyContent: 'center',
                border: 'none',
                borderBottom: v ? 'none' : '3px solid var(--faint)',
                background: ok === true ? 'var(--mint)' : ok === false ? 'var(--rose)' : v ? 'var(--peach-soft)' : 'var(--track)',
                color: ok === true ? '#1F5136' : ok === false ? '#6E2236' : 'var(--ink)',
                boxShadow: v && ok === null ? '0 3px 0 #EBC09F' : 'none',
                textDecoration: ok === false ? 'line-through' : 'none',
              }}
            >
              {v ? <RichText text={v} /> : ' '}
            </motion.button>
          )
        })}
      </p>
      {answered ? (
        b.blanks.some((x, i) => !same(values[i], x.answer)) && (
          <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 15, fontWeight: 800, color: 'var(--mint-ink)' }}>
            Réponse : {b.blanks.map((x) => x.answer).join(' · ')}
          </motion.p>
        )
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {choices.map((c, ci) => {
              const used = filled.includes(ci)
              return (
                <motion.button
                  key={ci}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: used ? 0.35 : 1, y: 0, scale: used ? 0.94 : 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 26, delay: used ? 0 : 0.05 * ci }}
                  whileTap={used ? undefined : { scale: 0.94, y: 2 }}
                  onClick={() => pick(ci)}
                  disabled={used}
                  className={used ? undefined : 'raised-sm'}
                  style={{
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: 16,
                    fontSize: 16,
                    fontWeight: 800,
                    background: used ? 'var(--track)' : 'var(--bg)',
                  }}
                >
                  <RichText text={c} />
                </motion.button>
              )
            })}
          </div>
          <Button
            variant="dark"
            disabled={!complete}
            onClick={() => {
              const vals = filled.map((c) => choices[c!])
              const ok = vals.every((v, i) => same(v, b.blanks[i].answer))
              grade(ok)
              onAnswer({ correct: ok, value: vals })
            }}
          >
            Valider
          </Button>
        </>
      )}
    </section>
  )
}

// --- Match pairs -----------------------------------------------------------------

const PAIR_COLORS = [
  ['var(--mint)', '#1F5136'],
  ['var(--sky)', 'var(--sky-ink)'],
  ['var(--lavender)', 'var(--lavender-ink)'],
  ['var(--butter)', 'var(--butter-ink)'],
  ['var(--peach-soft)', 'var(--peach-ink)'],
]

function MatchItem({
  text,
  state,
  color,
  onClick,
  shakeKey,
}: {
  text: string
  state: 'idle' | 'selected' | 'done'
  color?: string[]
  onClick: () => void
  shakeKey: number
}) {
  const controls = useAnimationControls()
  useEffect(() => {
    if (shakeKey) void controls.start({ x: [0, -7, 7, -4, 4, 0], transition: { duration: 0.35 } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shakeKey])
  return (
    <motion.button
      animate={controls}
      whileTap={state === 'done' ? undefined : { scale: 0.96 }}
      onClick={onClick}
      disabled={state === 'done'}
      className={state === 'idle' ? 'raised-sm' : undefined}
      style={{
        minHeight: 56,
        width: '100%',
        padding: '10px 12px',
        borderRadius: 18,
        fontSize: 15,
        fontWeight: 800,
        lineHeight: 1.3,
        border: state === 'selected' ? '2px solid var(--peach)' : '2px solid transparent',
        background: state === 'done' ? color![0] : state === 'selected' ? 'var(--peach-soft)' : 'var(--bg)',
        color: state === 'done' ? color![1] : 'var(--ink)',
        boxShadow: state === 'selected' ? '0 4px 0 #EBC09F' : undefined,
        transition: 'background .25s, color .25s, border-color .2s',
      }}
    >
      <RichText text={text} />
    </motion.button>
  )
}

export function Match({ b, answer, onAnswer }: { b: B.MatchBlock; answer?: Answer; onAnswer: (a: Answer) => void }) {
  const n = b.pairs.length
  const lefts = useMemo(() => shuffled(b.pairs.map((_, i) => i), b.prompt + 'L'), [b, n])
  const rights = useMemo(() => shuffled(b.pairs.map((_, i) => i), b.prompt + 'R'), [b, n])
  const [matched, setMatched] = useState<number[]>([]) // pair indexes, in match order
  const [sel, setSel] = useState<{ side: 'l' | 'r'; i: number } | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const [shake, setShake] = useState<Record<string, number>>({})
  const answered = !!answer
  const done = answered ? b.pairs.map((_, i) => i) : matched

  const tap = (side: 'l' | 'r', i: number) => {
    if (answered || done.includes(i)) return
    if (!sel || sel.side === side) {
      play('tap')
      setSel(sel && sel.side === side && sel.i === i ? null : { side, i })
      return
    }
    if (sel.i === i) {
      const next = [...matched, i]
      setMatched(next)
      setSel(null)
      haptic(10)
      if (next.length === n) {
        const ok = mistakes === 0
        grade(ok)
        onAnswer({ correct: ok, value: { mistakes } })
      } else play('pop')
    } else {
      play('wrong')
      haptic(25)
      setMistakes((m) => m + 1)
      const k = side + i
      const k2 = sel.side + sel.i
      setShake((s) => ({ ...s, [k]: (s[k] ?? 0) + 1, [k2]: (s[k2] ?? 0) + 1 }))
      setSel(null)
    }
  }

  const colorOf = (i: number) => PAIR_COLORS[done.indexOf(i) % PAIR_COLORS.length]
  const stateOf = (side: 'l' | 'r', i: number) => (done.includes(i) ? 'done' : sel?.side === side && sel.i === i ? 'selected' : 'idle')

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Header tag="Associe" bg="var(--lavender)" ink="var(--lavender-ink)">
        <RichText text={b.prompt} />
      </Header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        {lefts.map((li, row) => (
          <FragmentRow key={row} delay={row}>
            <MatchItem text={b.pairs[li].left} state={stateOf('l', li)} color={colorOf(li)} onClick={() => tap('l', li)} shakeKey={shake['l' + li] ?? 0} />
            <MatchItem text={b.pairs[rights[row]].right} state={stateOf('r', rights[row])} color={colorOf(rights[row])} onClick={() => tap('r', rights[row])} shakeKey={shake['r' + rights[row]] ?? 0} />
          </FragmentRow>
        ))}
      </div>
      <AnimatePresence>
        {!answered && mistakes > 0 && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)', textAlign: 'center' }}>
            {mistakes} erreur{mistakes > 1 ? 's' : ''}
          </motion.span>
        )}
      </AnimatePresence>
    </section>
  )
}

function FragmentRow({ children, delay }: { children: ReactNode[]; delay: number }) {
  return (
    <>
      {children.map((c, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.1 + delay * 0.07 + i * 0.03 }}>
          {c}
        </motion.div>
      ))}
    </>
  )
}

// --- Estimate --------------------------------------------------------------------

const fmt = (v: number, step: number) => {
  const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)))
  return v.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function Estimate({ b, answer, onAnswer }: { b: B.EstimateBlock; answer?: Answer; onAnswer: (a: Answer) => void }) {
  const mid = b.min + Math.round((b.max - b.min) / 2 / b.step) * b.step
  const [value, setValue] = useState(mid)
  const [touched, setTouched] = useState(false)
  const answered = !!answer
  const guess = answered ? (answer!.value as number) : value
  const pct = (v: number) => ((v - b.min) / (b.max - b.min)) * 100
  const ok = answered ? !!answer!.correct : null
  const unit = b.unit ? ` ${b.unit}` : ''

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Header tag="Estime" bg="var(--sky)" ink="var(--sky-ink)">
        <RichText text={b.prompt} />
      </Header>
      <motion.div
        key={answered ? 'a' : 'q'}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ textAlign: 'center', fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', color: ok === null ? 'var(--ink)' : ok ? 'var(--mint-ink)' : 'var(--rose-ink)' }}
      >
        {fmt(guess, b.step)}
        <span style={{ fontSize: 20, fontWeight: 800 }}>{unit}</span>
      </motion.div>

      <div style={{ position: 'relative', height: 44, margin: '0 6px' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 17, height: 10, borderRadius: 5, background: 'var(--track)' }} />
        {answered && (
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.25 }}
            style={{
              position: 'absolute',
              top: 17,
              height: 10,
              borderRadius: 5,
              background: 'var(--mint-strong)',
              left: `${Math.max(0, pct(b.answer - b.tolerance))}%`,
              width: `${Math.min(100, pct(b.answer + b.tolerance)) - Math.max(0, pct(b.answer - b.tolerance))}%`,
            }}
          />
        )}
        {!answered && (
          <div style={{ position: 'absolute', left: 0, top: 17, height: 10, borderRadius: 5, background: 'var(--peach)', width: `${pct(value)}%` }} />
        )}
        <motion.div
          animate={{ left: `${pct(guess)}%` }}
          transition={{ type: 'spring', stiffness: 600, damping: 40 }}
          style={{
            position: 'absolute',
            top: 6,
            width: 32,
            height: 32,
            marginLeft: -16,
            borderRadius: 16,
            background: answered ? (ok ? 'var(--mint-strong)' : '#E79AAA') : 'var(--peach)',
            boxShadow: `0 4px 0 ${answered ? (ok ? 'var(--mint-lip)' : '#C97B8C') : 'var(--peach-lip)'}, 0 6px 12px rgba(120,80,40,.2)`,
            pointerEvents: 'none',
          }}
        />
        {answered && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, type: 'spring', stiffness: 400, damping: 18 }}
            style={{ position: 'absolute', top: -4, left: `${pct(b.answer)}%`, marginLeft: -2, width: 4, height: 52, borderRadius: 2, background: 'var(--mint-ink)' }}
          />
        )}
        {!answered && (
          <input
            type="range"
            aria-label="Ton estimation"
            min={b.min}
            max={b.max}
            step={b.step}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (Math.round((v - b.min) / b.step) % Math.max(1, Math.round((b.max - b.min) / b.step / 20)) === 0) haptic(4)
              setValue(v)
              setTouched(true)
            }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, margin: 0, cursor: 'pointer' }}
          />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, color: 'var(--muted)', margin: '-8px 6px 0' }}>
        <span>
          {fmt(b.min, b.step)}
          {unit}
        </span>
        <span>
          {fmt(b.max, b.step)}
          {unit}
        </span>
      </div>

      {answered ? (
        <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} style={{ fontSize: 15, fontWeight: 800, color: 'var(--mint-ink)', textAlign: 'center' }}>
          Réponse : {fmt(b.answer, b.step)}
          {unit}
        </motion.p>
      ) : (
        <Button
          variant="dark"
          disabled={!touched}
          onClick={() => {
            const good = Math.abs(value - b.answer) <= b.tolerance
            grade(good)
            onAnswer({ correct: good, value })
          }}
        >
          {touched ? 'Valider' : 'Glisse pour estimer'}
        </Button>
      )}
    </section>
  )
}

