import katex from 'katex'
import 'katex/dist/katex.min.css'
import { Fragment, useMemo } from 'react'

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
        if (p.kind === 'bold') return <strong key={i} style={{ fontWeight: 700 }}>{p.value}</strong>
        return <Fragment key={i}>{p.value}</Fragment>
      })}
    </>
  )
}

export function MathDisplay({ latex }: { latex: string }) {
  const html = useMemo(() => katex.renderToString(latex, { throwOnError: false, displayMode: true, output: 'htmlAndMathml' }), [latex])
  return <div style={{ overflowX: 'auto', fontSize: 20 }} dangerouslySetInnerHTML={{ __html: html }} />
}
