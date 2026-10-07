import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { MathDisplay, RichText } from '../components/RichText'
import { Button, Icon } from '../components/ui'
import type * as B from '../lib/blocks'
import { haptic, play } from '../lib/sound'
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

const stagger = (i: number) => ({ type: 'spring' as const, stiffness: 300, damping: 24, delay: 0.12 + i * 0.09 })

function Tag({ children, bg, ink }: { children: ReactNode; bg: string; ink: string }) {
  return (
    <span className="tag" style={{ background: bg, color: ink }}>
      {children}
    </span>
  )
}

const P = ({ children, strong }: { children: string; strong?: boolean }) => (
  <p style={{ fontSize: strong ? 17 : 16, lineHeight: 1.55, fontWeight: strong ? 800 : 600, color: strong ? 'var(--ink)' : 'var(--ink-soft)' }}>
    <RichText text={children} />
  </p>
)

// --- Content blocks ---------------------------------------------------------------

function Text({ b }: { b: B.TextBlock }) {
  return (
    <p style={{ fontSize: 17, lineHeight: 1.6, fontWeight: 600 }}>
      <RichText text={b.content} />
    </p>
  )
}

function Concept({ b }: { b: B.ConceptBlock }) {
  return (
    <article style={{ borderLeft: '4px solid var(--lavender-strong)', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--lavender-ink)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Nouveau concept</span>
      <h2 style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.25 }}>
        <RichText text={b.name} />
      </h2>
      <p style={{ fontSize: 17, lineHeight: 1.55, fontWeight: 800 }}>
        <RichText text={b.definition} />
      </p>
      <p style={{ fontSize: 17, lineHeight: 1.6, fontWeight: 600, color: 'var(--ink-soft)' }}>
        <RichText text={b.explanation} />
      </p>
    </article>
  )
}

function Example({ b }: { b: B.ExampleBlock }) {
  return (
    <article className="well" style={{ borderRadius: 24, padding: '16px 18px', display: 'flex', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: '#8A6A12' }}>
          Exemple · <RichText text={b.title} />
        </span>
        <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.55 }}>
          <RichText text={b.content} />
        </p>
      </div>
    </article>
  )
}

function Scenario({ b }: { b: B.ScenarioBlock }) {
  return (
    <article style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--rose)', color: 'var(--rose-ink)', fontWeight: 900, display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
          <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
        </svg>
      </motion.span>
      <motion.div
        initial={{ scale: 0.8, originX: 0, originY: 1 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 350, damping: 20, delay: 0.08 }}
        className="card"
        style={{ borderRadius: '24px 24px 24px 6px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--rose-ink)' }}>
          <RichText text={b.setting} />
        </span>
        <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5 }}>
          <RichText text={b.narrative} />
        </p>
        {b.prompt && (
          <p style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.45 }}>
            <RichText text={b.prompt} />
          </p>
        )}
      </motion.div>
    </article>
  )
}

function Analogy({ b }: { b: B.AnalogyBlock }) {
  return (
    <article className="card" style={{ borderRadius: 28, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Tag bg="var(--sky)" ink="var(--sky-ink)">
        Analogie
      </Tag>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 900, fontSize: 17 }}>
        <span style={{ flex: 1 }}>
          <RichText text={b.source} />
        </span>
        <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.6, repeat: Infinity }} style={{ color: 'var(--sky-ink)' }}>
          ⇄
        </motion.span>
        <span style={{ flex: 1 }}>
          <RichText text={b.target} />
        </span>
      </div>
      <div className="well" style={{ borderRadius: 18, padding: 6, display: 'flex', flexDirection: 'column' }}>
        {b.mappings.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={stagger(i)}
            style={{ display: 'flex', gap: 8, padding: '8px 10px', fontSize: 14, fontWeight: 700, borderTop: i ? '1px dashed var(--shadow-dark)' : 'none' }}
          >
            <span style={{ flex: 1 }}>
              <RichText text={m.source} />
            </span>
            <span style={{ color: 'var(--faint)' }}>→</span>
            <span style={{ flex: 1, color: 'var(--ink)' }}>
              <RichText text={m.target} />
            </span>
          </motion.div>
        ))}
      </div>
      <P>{b.explanation}</P>
      {b.limits && (
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>
          Limite : <RichText text={b.limits} />
        </p>
      )}
    </article>
  )
}

function Comparison({ b }: { b: B.ComparisonBlock }) {
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '0 -22px' }}>
      <div style={{ padding: '0 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Tag bg="var(--lavender)" ink="var(--lavender-ink)">
          Comparer
        </Tag>
        {b.items.length > 1 && (
          <motion.span animate={{ x: [0, 5, 0] }} transition={{ duration: 1.4, repeat: 3 }} style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)' }}>
            Glisse →
          </motion.span>
        )}
      </div>
      <h3 className="title-m" style={{ padding: '0 22px' }}>
        <RichText text={b.title} />
      </h3>
      <div
        ref={ref}
        className="scroll"
        onScroll={(e) => {
          const el = e.currentTarget
          const i = Math.round(el.scrollLeft / (el.clientWidth * 0.78))
          if (i !== active) {
            setActive(i)
            play('tap')
          }
        }}
        style={{ display: 'flex', gap: 16, padding: '6px 22px 18px', overflowX: 'auto', scrollSnapType: 'x mandatory', flex: 'none' }}
      >
        {b.items.map((it, i) => (
          <motion.article
            key={i}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={stagger(i)}
            className="card"
            style={{ flex: '0 0 76%', scrollSnapAlign: 'center', borderRadius: 28, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <span style={{ fontSize: 18, fontWeight: 900 }}>
              <RichText text={it.name} />
            </span>
            {b.dimensions.map((d, j) => (
              <div key={j} className="well" style={{ borderRadius: 18, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  <RichText text={d} />
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>
                  <RichText text={it.values[j] ?? ''} />
                </span>
              </div>
            ))}
          </motion.article>
        ))}
      </div>
      <div aria-hidden="true" style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {b.items.map((_, i) => (
          <motion.span
            key={i}
            animate={{ width: i === active ? 22 : 8, background: i === active ? 'var(--peach)' : 'var(--bg-deep)' }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            style={{ height: 8, borderRadius: 4 }}
          />
        ))}
      </div>
      {b.takeaway && (
        <p style={{ padding: '4px 22px 0', fontSize: 16, fontWeight: 800, lineHeight: 1.5 }}>
          <RichText text={b.takeaway} />
        </p>
      )}
    </section>
  )
}

function Chain({ items, tag }: { items: { title: string; text?: string }[]; tag: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {tag}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {items.map((it, i) => {
          const last = i === items.length - 1
          return (
            <motion.li key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={stagger(i * 1.6)} style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ ...stagger(i * 1.6), stiffness: 500, damping: 14 }}
                  className={last ? undefined : 'raised-sm'}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    fontWeight: 900,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    background: last ? 'var(--peach)' : 'var(--bg)',
                    boxShadow: last ? '0 3px 0 var(--peach-lip)' : undefined,
                  }}
                >
                  {i + 1}
                </motion.span>
                {!last && (
                  <motion.span
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.25, delay: 0.25 + i * 0.145 }}
                    style={{ width: 4, flex: 1, minHeight: 16, borderRadius: 2, background: 'var(--peach)', margin: '4px 0', originY: 0 }}
                  />
                )}
              </div>
              <div style={{ paddingTop: 7, paddingBottom: last ? 0 : 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: last ? 900 : 800, fontSize: last ? 17 : 16 }}>
                  <RichText text={it.title} />
                </span>
                {it.text && (
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.45 }}>
                    <RichText text={it.text} />
                  </span>
                )}
              </div>
            </motion.li>
          )
        })}
      </ol>
    </section>
  )
}

function Sequence({ b }: { b: B.SequenceBlock }) {
  return (
    <Chain
      items={b.steps.map((s) => ({ title: s.title, text: s.description }))}
      tag={
        <>
          <Tag bg="var(--mint)" ink="var(--mint-ink)">
            Étape par étape
          </Tag>
          <h3 className="title-m">
            <RichText text={b.title} />
          </h3>
        </>
      }
    />
  )
}

function CauseEffect({ b }: { b: B.CauseEffectBlock }) {
  return (
    <Chain
      items={b.chain.map((c) => ({ title: c.label, text: c.explanation }))}
      tag={
        <>
          <Tag bg="var(--peach-soft)" ink="var(--peach-ink)">
            Cause → effet
          </Tag>
          <h3 className="title-m">
            <RichText text={b.title} />
          </h3>
        </>
      }
    />
  )
}

function Code({ b }: { b: B.CodeBlock }) {
  const [copied, setCopied] = useState(false)
  const html = useMemo(() => {
    const lang = b.language.toLowerCase()
    try {
      return hljs.getLanguage(lang) ? hljs.highlight(b.code, { language: lang }).value : hljs.highlightAuto(b.code).value
    } catch {
      return b.code.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
    }
  }, [b.code, b.language])
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ borderRadius: 26, background: 'var(--ink)', overflow: 'hidden', boxShadow: '0 4px 14px rgba(43,38,32,.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 6px 18px' }}>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {['var(--rose)', 'var(--butter)', 'var(--mint)'].map((c) => (
              <span key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c }} />
            ))}
            <span style={{ marginLeft: 8, fontFamily: 'var(--mono)', fontSize: 12, color: '#9B948A' }}>{b.language}</span>
          </span>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              void navigator.clipboard?.writeText(b.code)
              setCopied(true)
              play('pop')
              setTimeout(() => setCopied(false), 1500)
            }}
            style={{ height: 32, padding: '0 12px', borderRadius: 16, border: 'none', background: copied ? 'var(--mint)' : '#3E372F', color: copied ? 'var(--mint-ink)' : '#F7F1E8', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, transition: 'background .25s' }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={String(copied)} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.15 }}>
                {copied ? 'Copié !' : 'Copier'}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
        <pre className="code scroll" style={{ margin: 0, padding: '6px 18px 18px', overflowX: 'auto', whiteSpace: 'pre' }} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      {b.caption && (
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)', padding: '0 4px' }}>
          <RichText text={b.caption} />
        </span>
      )}
      <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, padding: '0 4px' }}>
        <RichText text={b.explanation} />
      </p>
    </section>
  )
}

function MathB({ b }: { b: B.MathBlock }) {
  return (
    <section className="card" style={{ borderRadius: 28, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Tag bg="var(--sky)" ink="var(--sky-ink)">
        Formule
      </Tag>
      <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }} className="well" style={{ borderRadius: 20, padding: '4px 12px' }}>
        <MathDisplay latex={b.latex} />
      </motion.div>
      <P>{b.explanation}</P>
      {!!b.variables?.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {b.variables.map((v, i) => (
            <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 16, delay: 0.25 + i * 0.06 }} className="chip" style={{ background: 'var(--bg-deep)', fontWeight: 700 }}>
              <RichText text={`$${v.symbol}$`} /> {v.meaning}
            </motion.span>
          ))}
        </div>
      )}
    </section>
  )
}

// --- Interactive blocks ------------------------------------------------------------

function ChoiceButton({
  children,
  state,
  onClick,
  disabled,
}: {
  children: ReactNode
  state: 'idle' | 'selected' | 'correct' | 'wrong' | 'faded'
  onClick?: () => void
  disabled?: boolean
}) {
  const styles = {
    idle: { background: 'var(--bg)', color: 'var(--ink)', boxShadow: 'var(--raised-sm)', border: '2px solid transparent' },
    selected: { background: 'var(--peach-soft)', color: 'var(--ink)', boxShadow: '0 4px 0 #EBC09F', border: '2px solid var(--peach)' },
    correct: { background: 'var(--mint)', color: '#1F5136', boxShadow: '0 4px 0 #8CCBA4', border: '2px solid #8CCBA4' },
    wrong: { background: 'var(--rose)', color: '#6E2236', boxShadow: 'var(--inset-sm)', border: '2px solid #E79AAA' },
    faded: { background: 'var(--bg)', color: 'var(--faint)', boxShadow: 'none', border: '2px solid transparent' },
  }[state]
  return (
    <motion.button
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.97, y: 2 }}
      animate={state === 'wrong' ? { x: [0, -8, 8, -5, 5, 0] } : state === 'correct' ? { scale: [1, 1.04, 1] } : {}}
      transition={{ duration: 0.4 }}
      style={{
        minHeight: 60,
        padding: '12px 18px',
        borderRadius: 22,
        fontSize: 17,
        fontWeight: state === 'correct' ? 900 : 800,
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        transition: 'background .25s, color .25s, box-shadow .25s, border-color .25s',
        cursor: disabled ? 'default' : 'pointer',
        ...styles,
      }}
    >
      <span style={{ flex: 1 }}>{children}</span>
      <AnimatePresence>
        {(state === 'correct' || state === 'wrong') && (
          <motion.span initial={{ scale: 0, rotate: -60 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }} style={{ display: 'grid' }}>
            {state === 'correct' ? Icon.check(22, '#2F7A52') : Icon.cross(20, '#A33A52')}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

function Question({ b, answer, onAnswer }: { b: B.QuestionBlock; answer?: Answer; onAnswer: (a: Answer) => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const [text, setText] = useState('')
  const answered = !!answer
  const correctIds = b.correct_option_ids ?? []

  const grade = (correct: boolean, value: unknown) => {
    play(correct ? 'correct' : 'wrong')
    haptic(correct ? 12 : 30)
    onAnswer({ correct, value })
  }

  let body: ReactNode
  if (b.kind === 'single_choice' || b.kind === 'multiple_choice') {
    const chosen = answered ? (answer!.value as string[]) : selected
    body = (
      <div role="group" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(b.options ?? []).map((o, i) => {
          const isChosen = chosen.includes(o.id)
          const isCorrect = correctIds.includes(o.id)
          const state = answered ? (isCorrect ? 'correct' : isChosen ? 'wrong' : 'faded') : isChosen ? 'selected' : 'idle'
          return (
            <motion.div key={o.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={stagger(i)}>
              <ChoiceButton
                state={state}
                disabled={answered}
                onClick={() => {
                  play('tap')
                  if (b.kind === 'single_choice') {
                    const ok = isCorrect
                    setSelected([o.id])
                    grade(ok, [o.id])
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
            sound={null}
            onClick={() => grade(selected.length === correctIds.length && selected.every((s) => correctIds.includes(s)), selected)}
          >
            Valider
          </Button>
        )}
        {b.kind === 'multiple_choice' && !answered && (
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textAlign: 'center' }}>Plusieurs réponses possibles</span>
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
          <label htmlFor="open">Ta réponse</label>
          <textarea id="open" rows={3} value={answered ? String(answer!.value) : text} disabled={answered} onChange={(e) => setText(e.target.value)} placeholder="Écris ce que tu en penses…" />
        </div>
        {!answered && (
          <Button
            variant="dark"
            disabled={!text.trim()}
            sound="pop"
            onClick={() => onAnswer({ correct: null, value: text.trim() })}
          >
            Vérifier
          </Button>
        )}
      </div>
    )
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Tag bg="var(--sky)" ink="var(--sky-ink)">
        Question
      </Tag>
      <h2 style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.3 }}>
        <RichText text={b.prompt} />
      </h2>
      {body}
    </section>
  )
}

function TrueFalse({ chosen, truth, onPick }: { chosen: boolean | null; truth: boolean; onPick: (v: boolean) => void }) {
  const answered = chosen !== null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
      {[true, false].map((v) => {
        const state = answered ? (v === truth ? 'correct' : v === chosen ? 'wrong' : 'faded') : 'idle'
        return (
          <ChoiceButton key={String(v)} state={state} disabled={answered} onClick={() => onPick(v)}>
            <span style={{ display: 'block', textAlign: 'center', fontSize: 18 }}>{v ? 'Vrai' : 'Faux'}</span>
          </ChoiceButton>
        )
      })}
    </div>
  )
}

function Misconception({ b, answer, onAnswer }: { b: B.MisconceptionBlock; answer?: Answer; onAnswer: (a: Answer) => void }) {
  return (
    <section className="card" style={{ borderRadius: 28, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Tag bg="var(--rose)" ink="var(--rose-ink)">
        Idée reçue ?
      </Tag>
      <motion.p initial={{ scale: 0.95 }} animate={{ scale: 1 }} style={{ fontSize: 19, fontWeight: 900, lineHeight: 1.35 }}>
        « <RichText text={b.statement} /> »
      </motion.p>
      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--muted)' }}>Vrai ou faux ?</span>
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
  const [text, setText] = useState('')
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Tag bg="var(--mint)" ink="var(--mint-ink)">
        À toi
      </Tag>
      <h2 style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.3 }}>
        <RichText text={b.prompt} />
      </h2>
      {b.guidance && (
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>
          <RichText text={b.guidance} />
        </p>
      )}
      <div className="field">
        <label htmlFor="apply">{b.optional === false ? 'Ta réponse' : 'Facultatif, juste pour toi'}</label>
        <textarea id="apply" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Note une idée…" />
      </div>
    </section>
  )
}

function Recap({ b }: { b: B.RecapBlock }) {
  const dots = ['var(--peach)', 'var(--lavender-strong)', 'var(--mint-strong)', '#8DB8E0', '#E2C766', '#E79AAA']
  const chips = [
    ['var(--peach-soft)', 'var(--peach-ink)'],
    ['var(--lavender)', 'var(--lavender-ink)'],
    ['var(--mint)', 'var(--mint-ink)'],
    ['var(--sky)', 'var(--sky-ink)'],
  ]
  return (
    <section className="card" style={{ borderRadius: 28, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: 16, fontWeight: 900 }}>À retenir</span>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {b.points.map((p, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={stagger(i)} style={{ display: 'flex', gap: 10, fontSize: 15, fontWeight: 600, lineHeight: 1.45 }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: dots[i % dots.length], marginTop: 6, flexShrink: 0 }} />
            <span>
              <RichText text={p} />
            </span>
          </motion.li>
        ))}
      </ul>
      {!!b.concepts?.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 2 }}>
          {b.concepts.map((c, i) => (
            <motion.span
              key={c}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.3 + b.points.length * 0.09 + i * 0.08 }}
              className="chip"
              style={{ background: chips[i % 4][0], color: chips[i % 4][1] }}
            >
              + {c}
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
