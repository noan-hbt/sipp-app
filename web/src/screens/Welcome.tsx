import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RevealLines } from '../components/motion'
import { Screen } from '../components/Screen'
import { illustration } from '../components/SipIcon'
import { Button } from '../components/ui'
import { t } from '../lib/i18n'

/** What Sipp does, played out: a wish gets typed, a path of modules comes back. Light tones stay light in dark mode (the caramel band is the same in both). */
const LOOKS = [
  { art: 'topic-sleep', bg: '#ece8ff', ink: '#2e2660', lessons: 11 },
  { art: 'topic-language', bg: '#ffe6d4', ink: '#8a3d16', lessons: 14 },
  { art: 'topic-space', bg: '#dceffc', ink: '#15334a', lessons: 9 },
  { art: 'topic-finance', bg: '#d9f3e4', ink: '#173a2a', lessons: 10 },
] as const
const EXAMPLES = t.welcome.examples.map((ex, i) => ({ ...ex, ...LOOKS[i % LOOKS.length] }))

const TYPE_MS = 42
const HOLD_MS = 3600

/** Types each example's wish, then shows the path Sipp builds from it, and moves on to the next one. */
function Showcase() {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [typed, setTyped] = useState(0)
  const ex = EXAMPLES[i]
  const done = reduce || typed >= ex.wish.length

  useEffect(() => {
    if (!done) {
      const timer = setTimeout(() => setTyped((n) => n + 1), typed === 0 ? 500 : TYPE_MS)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => {
      setTyped(0)
      setI((n) => (n + 1) % EXAMPLES.length)
    }, HOLD_MS + (reduce ? 1500 : 0))
    return () => clearTimeout(timer)
  }, [done, typed, reduce])

  return (
    <div style={{ position: 'absolute', left: 16, right: 16, bottom: 22, maxWidth: 380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ borderRadius: 22, padding: '12px 16px 14px', background: '#fff', color: '#1d1a17', boxShadow: '0 14px 30px rgba(90,30,8,.25)', minHeight: 88 }}>
        <span className="kicker" style={{ color: '#b8471a' }}>{t.welcome.youWrite}</span>
        <p className="display" style={{ fontSize: 19, lineHeight: 1.2, marginTop: 4 }}>
          {t.welcome.iWant} {ex.wish.slice(0, reduce ? undefined : typed)}
          {!done && <span style={{ display: 'inline-block', width: 2, height: '1em', marginLeft: 1, verticalAlign: '-0.12em', background: '#d9622b' }} />}
        </p>
      </div>

      <span style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#fff0c2', opacity: done ? 1 : 0.55, transition: 'opacity .3s' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v14M6 12l6 6 6-6" />
        </svg>
        {t.welcome.sippWrites}
      </span>

      <div style={{ height: 196, position: 'relative' }}>
        <AnimatePresence mode="wait">
          {done && (
            <motion.div
              key={i}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              style={{ position: 'absolute', inset: 0, borderRadius: 26, padding: 14, background: ex.bg, color: '#1d1a17', display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={illustration(ex.art)} alt="" width={48} height={48} />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="display" style={{ fontSize: 17, lineHeight: 1.1 }}>{ex.title}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: ex.ink }}>
                    {t.welcome.pathMeta(ex.modules.length, ex.lessons)}
                  </span>
                </div>
              </div>
              {ex.modules.map((m, k) => (
                <motion.div
                  key={m}
                  initial={reduce ? false : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + k * 0.12 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, height: 34, padding: '0 10px', borderRadius: 14, background: 'rgba(255,255,255,.72)', fontSize: 14, fontWeight: 600 }}
                >
                  <span style={{ width: 20, height: 20, borderRadius: 10, background: ex.ink, color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{k + 1}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m}</span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** First visit: show what Sipp does (a wish in, a course out), then try before signing up. */
export function Welcome() {
  const nav = useNavigate()
  return (
    <Screen kind="fade">
      <div className="scroll" style={{ display: 'flex', flexDirection: 'column' }}>
        <div aria-hidden="true" style={{ position: 'relative', flexShrink: 0, height: 'calc(var(--safe-top) + 400px)', borderRadius: '0 0 44px 44px', background: '#d9622b', overflow: 'hidden' }}>
          <span style={{ position: 'absolute', left: '50%', bottom: -60, width: 340, height: 340, marginLeft: -170, borderRadius: 170, background: '#e5763f' }} />
          <Showcase />
        </div>
        <div style={{ padding: '24px 24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1 className="display" style={{ fontSize: 36, lineHeight: 0.98, letterSpacing: '-0.05em' }}>
            <RevealLines lines={[{ text: t.welcome.title[0] }, { text: t.welcome.title[1], color: 'var(--primary)' }]} delay={0.3} />
          </h1>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="muted" style={{ fontSize: 16, lineHeight: 1.45 }}>
            {t.welcome.body}
          </motion.p>
        </div>
      </div>
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.55 }}
        className="bottom-bar"
        style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12 }}
      >
        <Button onClick={() => nav('/start')} sound="pop">
          {t.welcome.start}
        </Button>
        <Button variant="soft" onClick={() => nav('/demo')}>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4.5v15l13-7.5z" fill="var(--primary)" />
          </svg>
          {t.welcome.demo}
        </Button>
        <button onClick={() => nav('/login')} style={{ border: 'none', background: 'none', height: 44, fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>
          {t.welcome.login}
        </button>
      </motion.div>
    </Screen>
  )
}
