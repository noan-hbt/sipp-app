import katex from 'katex'
import 'katex/dist/katex.min.css'
import { Fragment, useLayoutEffect, useMemo, useRef } from 'react'
import { HScroll } from './HScroll'

type Part = { kind: 'text' | 'math' | 'code' | 'bold'; value: string }

/** Splits LLM text into plain text, inline $math$, `code` and **bold**. `\$` is a literal dollar. */
function parse(src: string): Part[] {
  const parts: Part[] = []
  let buf = ''
  let i = 0
  const flush = () => {
    if (buf) parts.push({ kind: 'text', value: buf })
    buf = ''
  }
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\\' && src[i + 1] === '$') {
      buf += '$'
      i += 2
      continue
    }
    const delim = ch === '$' ? '$' : ch === '`' ? '`' : src.startsWith('**', i) ? '**' : null
    if (delim) {
      const end = src.indexOf(delim, i + delim.length)
      if (end > i + delim.length) {
        flush()
        const value = src.slice(i + delim.length, end)
        parts.push({ kind: delim === '$' ? 'math' : delim === '`' ? 'code' : 'bold', value })
        i = end + delim.length
        continue
      }
    }
    buf += ch
    i++
  }
  flush()
  return parts
}

/**
 * Typography: « ? ! : ; » never start a line alone (non-breaking space before them), and a number
 * stays whole with its unit ("200 000 €", "35 %", "5 h" never break across lines).
 */
export const typo = (s: string) =>
  s
    .replace(/ ([?!:;»])/g, '\u00a0$1')
    .replace(/« /g, '«\u00a0')
    .replace(/(\d) (?=\d{3}(?!\d))/g, '$1\u202f')
    .replace(/(\d) (?=[€%$£]|(?:h|min|s|ans?|mois|jours?|mg|g|kg|km|m|cm|ml|L|°C?)(?![\p{L}\d]))/gu, '$1\u00a0')

export function RichText({ text }: { text: string }) {
  const parts = useMemo(() => parse(text), [text])
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'math') {
          const html = katex.renderToString(p.value, { throwOnError: false, output: 'htmlAndMathml' })
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
        }
        if (p.kind === 'code')
          return (
            <code
              key={i}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '0.85em',
                background: 'var(--lavender)',
                color: 'var(--lavender-ink)',
                padding: '1px 6px',
                borderRadius: 8,
              }}
            >
              {p.value}
            </code>
          )
        if (p.kind === 'bold') return <strong key={i} style={{ fontWeight: 700 }}>{typo(p.value)}</strong>
        return <Fragment key={i}>{typo(p.value)}</Fragment>
      })}
    </>
  )
}

const MATH_SIZE = 20
const MATH_MIN = 13

/** A display formula shrinks to fit the screen; past the minimum size it scrolls, with faded edges. */
export function MathDisplay({ latex }: { latex: string }) {
  const html = useMemo(() => katex.renderToString(latex, { throwOnError: false, displayMode: true, output: 'htmlAndMathml' }), [latex])
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.fontSize = `${MATH_SIZE}px`
      const ratio = el.clientWidth / Math.max(1, el.scrollWidth)
      if (ratio < 1) el.style.fontSize = `${Math.max(MATH_MIN, Math.floor(MATH_SIZE * ratio))}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el.parentElement ?? el)
    return () => ro.disconnect()
  }, [html])
  return (
    <HScroll>
      <div ref={ref} style={{ fontSize: MATH_SIZE }} dangerouslySetInnerHTML={{ __html: html }} />
    </HScroll>
  )
}
