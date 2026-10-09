import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ErrorNotice } from '../components/ErrorNotice'
import { MathDisplay, RichText } from '../components/RichText'
import { Button, Icon } from '../components/ui'
import type * as B from '../lib/blocks'
import { haptic, play } from '../lib/sound'
import { Kicker, TONES, type Tone } from './Kicker'
import { Estimate, FillBlanks, Match } from './Practice'

hljs.registerLanguage('python', python)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('json', json)

export interface Answer {
  correct: boolean | null // null = not graded (open question)
  value: unknown
}

/** The model sometimes quotes the statement itself; the card already adds « ». */
const unquote = (s: string) => s.trim().replace(/^[«"“'‘]\s*/, '').replace(/\s*[»"”'’]$/, '')

const stagger = (i: number) => ({ type: 'spring' as const, stiffness: 300, damping: 24, delay: 0.12 + i * 0.09 })

const P = ({ children, lead }: { children: string; lead?: boolean }) => (
  <p className={lead ? 'lx-lead' : 'lx-p'}>
    <RichText text={children} />
  </p>
)

const H = ({ children }: { children: string }) => (
  <h3 className="lx-h">
    <RichText text={children} />
  </h3>
)

// --- Content blocks ---------------------------------------------------------------

function Text({ b }: { b: B.TextBlock }) {
  return <P>{b.content}</P>
}

function Concept({ b }: { b: B.ConceptBlock }) {
  return (
    <article className="lx-card">
      <Kicker icon="concept" tone="peach">
        Nouvelle notion
      </Kicker>
      <H>{b.name}</H>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={stagger(1)}
        className="lx-lead"
        style={{ background: 'var(--peach-soft)', borderRadius: 18, padding: '12px 14px' }}
      >
        <RichText text={b.definition} />
      </motion.p>
      <P>{b.explanation}</P>
    </article>
  )
}

function Example({ b }: { b: B.ExampleBlock }) {
  return (
    <article style={{ background: 'var(--sky)', borderRadius: 24, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Kicker icon="example" tone="sky" onTint>
        Exemple
      </Kicker>
      <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.35 }}>
        <RichText text={b.title} />
      </span>
      <p className="lx-p" style={{ fontSize: 16, color: 'var(--sky-ink)' }}>
        <RichText text={b.content} />
      </p>
    </article>
  )
}

function Scenario({ b }: { b: B.ScenarioBlock }) {
  // A short setting ("Au marché") is the kicker; a sentence reads as small red text there,
  // so it opens the card instead.
  const short = b.setting.length <= 40
  return (
    <article style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Kicker icon="scenario" tone="rose">
        {short ? <RichText text={b.setting} /> : 'Mise en situation'}
      </Kicker>
      <motion.div
        initial={{ scale: 0.9, originX: 0, originY: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 350, damping: 22 }}
        className="card"
        style={{ borderRadius: '6px 24px 24px 24px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 12 }}
      >
        {!short && (
          <p className="lx-p" style={{ fontWeight: 600, color: 'var(--ink)' }}>
            <RichText text={b.setting} />
          </p>
        )}
        <P>{b.narrative}</P>
        {b.prompt && <P lead>{b.prompt}</P>}
      </motion.div>
    </article>
  )
}

function Analogy({ b }: { b: B.AnalogyBlock }) {
  return (
    <article className="lx-card">
      <Kicker icon="analogy" tone="sky">
        Analogie
      </Kicker>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: 8 }}>
        <span style={{ background: 'var(--butter)', color: 'var(--butter-ink)', borderRadius: 16, padding: '10px 12px', fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>
          <RichText text={b.source} />
        </span>
        <span aria-label="comme" style={{ color: 'var(--faint)', fontSize: 18 }}>
          →
        </span>
        <span style={{ background: 'var(--sky)', color: 'var(--sky-ink)', borderRadius: 16, padding: '10px 12px', fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>
          <RichText text={b.target} />
        </span>
      </div>
      <P>{b.explanation}</P>
      {!!b.mappings.length && (
        <div role="table" style={{ borderRadius: 18, boxShadow: 'inset 0 0 0 1.5px var(--line-strong)', overflow: 'hidden' }}>
          <div role="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--bg-deep)', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            <span role="columnheader" style={{ padding: '8px 12px' }}>
              L’image
            </span>
            <span role="columnheader" style={{ padding: '8px 12px' }}>
              En vrai
            </span>
          </div>
          {b.mappings.map((m, i) => (
            <motion.div
              role="row"
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={stagger(i)}
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: 15, lineHeight: 1.4, borderTop: '1.5px solid var(--line)' }}
            >
              <span role="cell" style={{ padding: '10px 12px', color: 'var(--ink-soft)' }}>
                <RichText text={m.source} />
              </span>
              <span role="cell" style={{ padding: '10px 12px', fontWeight: 600, borderLeft: '1.5px solid var(--line)' }}>
                <RichText text={m.target} />
              </span>
            </motion.div>
          ))}
        </div>
      )}
      {b.limits && (
        <p className="lx-small">
          <strong style={{ fontWeight: 600, color: 'var(--ink-soft)' }}>Limite de l’image · </strong>
          <RichText text={b.limits} />
        </p>
      )}
    </article>
  )
}

const COLUMN_TONES: Tone[] = ['peach', 'lavender', 'mint', 'sky', 'butter']

/** One card per item, swiped sideways: each keeps its colour and reads on its own, whatever the text length. */
function Comparison({ b }: { b: B.ComparisonBlock }) {
  const tones = b.items.map((_, i) => TONES[COLUMN_TONES[i % COLUMN_TONES.length]])
  const deck = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  const go = (i: number) => {
    const el = deck.current?.children[i] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Kicker icon="compare" tone="lavender">
        Comparer
      </Kicker>
      <H>{b.title}</H>
      <div
        ref={deck}
        role="list"
        aria-label={`${b.items.length} éléments comparés`}
        onScroll={(e) => {
          const el = e.currentTarget
          const card = el.firstElementChild as HTMLElement | null
          if (card) setAt(Math.min(b.items.length - 1, Math.round(el.scrollLeft / (card.offsetWidth + 10))))
        }}
        style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', margin: '0 -20px', padding: '0 20px 4px', scrollPaddingInline: 20, scrollbarWidth: 'none' }}
      >
        {b.items.map((it, i) => (
          <motion.article
            key={i}
            role="listitem"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i }}
            style={{ scrollSnapAlign: 'start', flex: `0 0 ${b.items.length === 1 ? 100 : 84}%`, borderRadius: 24, background: 'var(--surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <span style={{ padding: '14px 16px', background: tones[i][0], color: tones[i][1], fontFamily: 'var(--display)', fontSize: 19, fontWeight: 600, lineHeight: 1.2, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <RichText text={it.name} />
              <span style={{ fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, opacity: 0.75, flexShrink: 0 }}>
                {i + 1}/{b.items.length}
              </span>
            </span>
            <dl style={{ margin: 0, padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {b.dimensions.map((d, j) => (
                <div key={j}>
                  <dt style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.03em', textTransform: 'uppercase' }}>
                    <RichText text={d} />
                  </dt>
                  <dd style={{ margin: '2px 0 0', fontSize: 15, lineHeight: 1.45 }}>
                    <RichText text={it.values[j] ?? '–'} />
                  </dd>
                </div>
              ))}
            </dl>
          </motion.article>
        ))}
      </div>
      {b.items.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
          {b.items.map((it, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Voir ${it.name}`}
              aria-current={i === at}
              onClick={() => go(i)}
              style={{ border: 'none', padding: 0, height: 8, width: i === at ? 22 : 8, borderRadius: 4, background: i === at ? tones[i][1] : 'var(--line-strong)', transition: 'width .2s, background .2s' }}
            />
          ))}
        </div>
      )}
      {b.takeaway && (
        <p className="lx-lead" style={{ display: 'flex', gap: 8 }}>
          <span aria-hidden="true" style={{ color: 'var(--primary)' }}>→</span>
          <span>
            <RichText text={b.takeaway} />
          </span>
        </p>
      )}
    </section>
  )
}

function Sequence({ b }: { b: B.SequenceBlock }) {
  const n = b.steps.length
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Kicker icon="steps" tone="mint">
        Étape par étape
      </Kicker>
      <H>{b.title}</H>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {b.steps.map((s, i) => (
          <motion.li key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(i * 1.4)} style={{ display: 'flex', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--mint)', color: 'var(--mint-ink)', fontWeight: 700, fontSize: 15, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{i + 1}</span>
              {i < n - 1 && <span style={{ width: 2, flex: 1, minHeight: 12, background: 'var(--line-strong)', margin: '4px 0' }} />}
            </div>
            <div style={{ paddingTop: 4, paddingBottom: i < n - 1 ? 16 : 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 17, lineHeight: 1.3 }}>
                <RichText text={s.title} />
              </span>
              {s.description && (
                <span className="lx-p" style={{ fontSize: 15, lineHeight: 1.5 }}>
                  <RichText text={s.description} />
                </span>
              )}
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  )
}

function CauseEffect({ b }: { b: B.CauseEffectBlock }) {
  const n = b.chain.length
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Kicker icon="cause" tone="peach">
        Cause et effet
      </Kicker>
      <H>{b.title}</H>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
        {b.chain.map((c, i) => {
          const last = i === n - 1
          return (
            <motion.li key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(i * 1.4)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ alignSelf: 'stretch', borderRadius: 18, padding: '12px 14px', background: last ? 'var(--peach-soft)' : 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.3, color: last ? 'var(--peach-ink)' : 'var(--ink)' }}>
                  <RichText text={c.label} />
                </span>
                {c.explanation && (
                  <span className="lx-p" style={{ fontSize: 15, lineHeight: 1.45 }}>
                    <RichText text={c.explanation} />
                  </span>
                )}
              </div>
              {!last && (
                <svg width="20" height="26" viewBox="0 0 20 26" aria-hidden="true" style={{ margin: '2px 0' }}>
                  <path d="M10 2v20M4 16l6 6 6-6" fill="none" stroke="var(--peach)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </motion.li>
          )
        })}
      </ol>
    </section>
  )
}

function Code({ b }: { b: B.CodeBlock }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [copying, setCopying] = useState(false)
  async function copy() {
    setCopying(true)
    setCopied(false)
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(b.code)
      setCopied(true)
      play('pop')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyError(true)
    } finally {
      setCopying(false)
    }
  }
  const html = useMemo(() => {
    const lang = b.language.toLowerCase()
    try {
      return hljs.getLanguage(lang) ? hljs.highlight(b.code, { language: lang }).value : hljs.highlightAuto(b.code).value
    } catch {
      return b.code.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
    }
  }, [b.code, b.language])
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Kicker icon="code" tone="lavender">
        {b.caption ? <RichText text={b.caption} /> : 'Code'}
      </Kicker>
      <div style={{ borderRadius: 22, background: '#1d1a17', boxShadow: 'inset 0 0 0 1.5px var(--line-strong)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 10px 4px 18px' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#9B948A' }}>{b.language}</span>
          <motion.button
            whileTap={{ scale: 0.9 }}
            aria-live="polite"
            aria-atomic="true"
            disabled={copying}
            onClick={() => void copy()}
            style={{ height: 32, padding: '0 12px', borderRadius: 16, border: 'none', background: copied ? 'var(--mint)' : '#3E372F', color: copied ? 'var(--mint-ink)' : '#F7F1E8', fontSize: 13, fontWeight: 600, transition: 'background .25s' }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={String(copied)} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.15 }} style={{ display: 'block' }}>
                {copied ? 'Copié !' : 'Copier'}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
        <pre className="code" style={{ margin: 0, padding: '6px 18px 18px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      {copyError && <ErrorNotice message="La copie a échoué. Réessaie." retry={() => void copy()} busy={copying} />}
      <P>{b.explanation}</P>
    </section>
  )
}

function MathB({ b }: { b: B.MathBlock }) {
  return (
    <section className="lx-card">
      <Kicker icon="math" tone="sky">
        Formule
      </Kicker>
      <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }} className="well" style={{ borderRadius: 18, padding: '2px 12px' }}>
        <MathDisplay latex={b.latex} />
      </motion.div>
      {!!b.variables?.length && (
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 14, rowGap: 6, fontSize: 15, lineHeight: 1.4 }}>
          {b.variables.map((v, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <dt style={{ fontWeight: 600, textAlign: 'center', minWidth: 28 }}>
                <RichText text={`$${v.symbol}$`} />
              </dt>
              <dd style={{ margin: 0, color: 'var(--ink-soft)' }}>
                <RichText text={v.meaning} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      <P>{b.explanation}</P>
    </section>
  )
}

// --- Interactive blocks ------------------------------------------------------------

type ChoiceState = 'idle' | 'selected' | 'correct' | 'wrong' | 'faded'

function ChoiceButton({
  children,
  state,
  badge,
  onClick,
  disabled,
  center,
}: {
  children: ReactNode
  state: ChoiceState
  badge?: string
  onClick?: () => void
  disabled?: boolean
  center?: boolean
}) {
  const look = {
    idle: { background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 2px var(--line)', badgeBg: 'var(--bg-deep)', badgeInk: 'var(--muted)' },
    selected: { background: 'var(--primary-soft)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 2.5px var(--primary)', badgeBg: 'var(--primary)', badgeInk: '#fff' },
    correct: { background: 'var(--mint)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 2.5px var(--mint-strong)', badgeBg: 'var(--mint-lip)', badgeInk: '#fff' },
    wrong: { background: 'var(--rose)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 2.5px var(--coral)', badgeBg: 'var(--coral)', badgeInk: '#fff' },
    faded: { background: 'var(--surface)', color: 'var(--faint)', boxShadow: 'inset 0 0 0 2px var(--line)', badgeBg: 'var(--bg-deep)', badgeInk: 'var(--faint)' },
  }[state]
  const { badgeBg, badgeInk, ...style } = look
  return (
    <motion.button
      disabled={disabled}
      onClick={onClick}
      aria-pressed={state === 'selected' || undefined}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      animate={state === 'wrong' ? { x: [0, -8, 8, -5, 5, 0] } : state === 'correct' ? { scale: [1, 1.03, 1] } : {}}
      transition={{ duration: 0.4 }}
      style={{
        width: '100%',
        minHeight: 58,
        padding: '12px 14px',
        borderRadius: 20,
        border: 'none',
        fontSize: 16,
        fontWeight: state === 'idle' || state === 'faded' ? 500 : 600,
        lineHeight: 1.35,
        textAlign: center ? 'center' : 'left',
        display: 'flex',
        alignItems: 'center',
        justifyContent: center ? 'center' : undefined,
        gap: 12,
        transition: 'background .25s, color .25s, box-shadow .25s',
        cursor: disabled ? 'default' : 'pointer',
        ...style,
      }}
    >
      {badge && (
        <span style={{ width: 30, height: 30, borderRadius: 15, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, background: badgeBg, color: badgeInk, flexShrink: 0, transition: 'background .25s, color .25s' }}>
          {state === 'correct' ? Icon.check(15, '#fff') : state === 'wrong' ? Icon.cross(14, '#fff') : badge}
        </span>
      )}
      <span style={{ flex: center ? undefined : 1 }}>{children}</span>
      {!badge && (state === 'correct' || state === 'wrong') && (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }} style={{ display: 'grid' }}>
          {state === 'correct' ? Icon.check(18, 'var(--mint-ink)') : Icon.cross(16, 'var(--rose-ink)')}
        </motion.span>
      )}
    </motion.button>
  )
}

const LETTERS = 'ABCDEFGH'

function Question({ b, answer, onAnswer }: { b: B.QuestionBlock; answer?: Answer; onAnswer: (a: Answer) => void }) {
  const inputId = useId()
  const [selected, setSelected] = useState<string[]>([])
  const [text, setText] = useState('')
  const answered = !!answer
  const correctIds = [...new Set(b.correct_option_ids ?? [])]

  const grade = (correct: boolean, value: unknown) => {
    play(correct ? 'correct' : 'wrong')
    haptic(correct ? 12 : 30)
    onAnswer({ correct, value })
  }

  let body: ReactNode
  if (b.kind === 'single_choice' || b.kind === 'multiple_choice') {
    const chosen = answered ? (answer!.value as string[]) : selected
    body = (
      <div role="group" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {b.kind === 'multiple_choice' && !answered && <span className="lx-small" style={{ fontSize: 14 }}>Plusieurs réponses possibles</span>}
        {(b.options ?? []).map((o, i) => {
          const isChosen = chosen.includes(o.id)
          const isCorrect = correctIds.includes(o.id)
          const state: ChoiceState = answered ? (isCorrect ? 'correct' : isChosen ? 'wrong' : 'faded') : isChosen ? 'selected' : 'idle'
          return (
            <motion.div key={o.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(i)}>
              <ChoiceButton
                state={state}
                badge={LETTERS[i] ?? String(i + 1)}
                disabled={answered}
                onClick={() => {
                  play('tap')
                  if (b.kind === 'single_choice') {
                    setSelected([o.id])
                    grade(isCorrect, [o.id])
                  } else setSelected((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))
                }}
              >
                <RichText text={o.text} />
              </ChoiceButton>
            </motion.div>
          )
        })}
        {b.kind === 'multiple_choice' && !answered && (
          <Button
            variant="dark"
            disabled={!selected.length}
            style={{ marginTop: 4 }}
            onClick={() => grade(selected.length === correctIds.length && selected.every((s) => correctIds.includes(s)), selected)}
          >
            Valider
          </Button>
        )}
      </div>
    )
  } else if (b.kind === 'true_false') {
    const chosen = answered ? (answer!.value as boolean) : null
    body = <TrueFalse chosen={chosen} truth={!!b.answer} onPick={(v) => grade(v === !!b.answer, v)} />
  } else {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field">
          <label htmlFor={inputId}>Ta réponse</label>
          <textarea id={inputId} rows={3} value={answered ? String(answer!.value) : text} disabled={answered} onChange={(e) => setText(e.target.value)} placeholder="Écris ce que tu en penses…" />
        </div>
        {!answered && (
          <Button variant="dark" disabled={!text.trim()} sound="pop" onClick={() => onAnswer({ correct: null, value: text.trim() })}>
            Vérifier
          </Button>
        )}
      </div>
    )
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Kicker icon="question" tone="lavender">
        {b.kind === 'open' ? 'À toi de formuler' : 'Question'}
      </Kicker>
      <h2 className="lx-h">
        <RichText text={b.prompt} />
      </h2>
      {body}
    </section>
  )
}

function TrueFalse({ chosen, truth, onPick }: { chosen: boolean | null; truth: boolean; onPick: (v: boolean) => void }) {
  const answered = chosen !== null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
      {[true, false].map((v) => {
        const state: ChoiceState = answered ? (v === truth ? 'correct' : v === chosen ? 'wrong' : 'faded') : 'idle'
        return (
          <ChoiceButton key={String(v)} state={state} disabled={answered} center onClick={() => onPick(v)}>
            <span style={{ fontSize: 17 }}>{v ? 'Vrai' : 'Faux'}</span>
          </ChoiceButton>
        )
      })}
    </div>
  )
}

function Misconception({ b, answer, onAnswer }: { b: B.MisconceptionBlock; answer?: Answer; onAnswer: (a: Answer) => void }) {
  return (
    <section style={{ background: 'var(--rose-soft)', borderRadius: 24, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Kicker icon="myth" tone="rose" onTint>
        Idée reçue ?
      </Kicker>
      <motion.p initial={{ scale: 0.96 }} animate={{ scale: 1 }} className="lx-h" style={{ fontSize: 20 }}>
        « <RichText text={unquote(b.statement)} /> »
      </motion.p>
      <TrueFalse
        chosen={answer ? (answer.value as boolean) : null}
        truth={b.is_true}
        onPick={(v) => {
          const ok = v === b.is_true
          play(ok ? 'correct' : 'wrong')
          haptic(ok ? 12 : 30)
          onAnswer({ correct: ok, value: v })
        }}
      />
    </section>
  )
}

function Application({ b }: { b: B.ApplicationBlock }) {
  const inputId = useId()
  const [text, setText] = useState('')
  return (
    <section style={{ background: 'var(--mint)', borderRadius: 24, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Kicker icon="apply" tone="mint" onTint>
        À toi de jouer
      </Kicker>
      <p className="lx-lead">
        <RichText text={b.prompt} />
      </p>
      {b.guidance && (
        <p className="lx-small" style={{ color: 'var(--mint-ink)' }}>
          <RichText text={b.guidance} />
        </p>
      )}
      <div className="field" style={{ boxShadow: 'none', marginTop: 2 }}>
        <label htmlFor={inputId}>{b.optional === false ? 'Ta réponse' : 'Facultatif, juste pour toi'}</label>
        <textarea id={inputId} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Note une idée…" />
      </div>
    </section>
  )
}

function Recap({ b }: { b: B.RecapBlock }) {
  return (
    <section style={{ background: 'var(--butter)', borderRadius: 24, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Kicker icon="recap" tone="butter" onTint>
        À retenir
      </Kicker>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {b.points.map((p, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={stagger(i)} style={{ display: 'flex', gap: 10, fontSize: 16, lineHeight: 1.5 }}>
            <span style={{ width: 22, height: 22, borderRadius: 11, background: 'var(--surface)', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>{Icon.check(12, 'var(--butter-ink)')}</span>
            <span>
              <RichText text={p} />
            </span>
          </motion.li>
        ))}
      </ul>
      {!!b.concepts?.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
          {b.concepts.map((c, i) => (
            <motion.span
              key={c}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 16, delay: 0.3 + b.points.length * 0.09 + i * 0.06 }}
              className="chip"
              style={{ background: 'color-mix(in srgb, var(--surface) 75%, transparent)', color: 'var(--butter-ink)' }}
            >
              {c}
            </motion.span>
          ))}
        </div>
      )}
    </section>
  )
}

export function BlockView({ block, answer, onAnswer }: { block: B.Block; answer?: Answer; onAnswer: (a: Answer) => void }) {
  switch (block.type) {
    case 'text':
      return <Text b={block} />
    case 'concept':
      return <Concept b={block} />
    case 'example':
      return <Example b={block} />
    case 'scenario':
      return <Scenario b={block} />
    case 'analogy':
      return <Analogy b={block} />
    case 'comparison':
      return <Comparison b={block} />
    case 'sequence':
      return <Sequence b={block} />
    case 'cause_effect':
      return <CauseEffect b={block} />
    case 'code':
      return <Code b={block} />
    case 'math':
      return <MathB b={block} />
    case 'misconception':
      return <Misconception b={block} answer={answer} onAnswer={onAnswer} />
    case 'question':
      return <Question b={block} answer={answer} onAnswer={onAnswer} />
    case 'fill_blanks':
      return <FillBlanks b={block} answer={answer} onAnswer={onAnswer} />
    case 'match':
      return <Match b={block} answer={answer} onAnswer={onAnswer} />
    case 'estimate':
      return <Estimate b={block} answer={answer} onAnswer={onAnswer} />
    case 'application':
      return <Application b={block} />
    case 'recap':
      return <Recap b={block} />
    default:
      return null
  }
}

/** Text shown in the feedback sheet after an interactive block. */
export function feedbackFor(block: B.Block): { explanation: string; expected?: string } {
  if (block.type === 'misconception') return { explanation: block.correction }
  if (block.type === 'question') return { explanation: block.explanation, expected: block.kind === 'open' ? block.expected_answer : undefined }
  if (block.type === 'fill_blanks' || block.type === 'match' || block.type === 'estimate') return { explanation: block.explanation }
  return { explanation: '' }
}
