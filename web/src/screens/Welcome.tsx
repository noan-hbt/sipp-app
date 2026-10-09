import { motion, useReducedMotion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { RevealLines } from '../components/motion'
import { Screen } from '../components/Screen'
import { illustration } from '../components/SipIcon'
import { Button } from '../components/ui'

/** Sample topics thrown on the table: what Sipp can teach. Light tones stay light in dark mode (the caramel band is the same in both). */
const STICKERS = [
  { name: 'Rome antique', art: 'topic-history', bg: '#ece8ff', ink: '#2e2660', left: '3%', top: 0, w: 132, rot: -9 },
  { name: 'Trous noirs', art: 'topic-space', bg: '#dceffc', ink: '#15334a', right: '3%', top: 8, w: 132, rot: 8 },
  { name: 'Cuisine japonaise', art: 'topic-cooking', bg: '#d9f3e4', ink: '#173a2a', left: '0%', top: 200, w: 116, rot: 7 },
  { name: 'Le jazz', art: 'topic-music', bg: '#fff0c2', ink: '#3b2c05', right: '0%', top: 196, w: 116, rot: -7 },
] as const

/** First visit: the promise, then try before signing up. */
export function Welcome() {
  const nav = useNavigate()
  const reduce = useReducedMotion()
  return (
    <Screen kind="fade">
      <div className="scroll" style={{ display: 'flex', flexDirection: 'column' }}>
        <div aria-hidden="true" style={{ position: 'relative', flexShrink: 0, height: 'calc(var(--safe-top) + 400px)', borderRadius: '0 0 44px 44px', background: '#d9622b', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 20, height: 350, maxWidth: 420, margin: '0 auto' }}>
            <motion.span
              initial={reduce ? false : { scale: 0.3 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 120, damping: 16 }}
              style={{ position: 'absolute', left: '50%', top: 40, width: 300, height: 300, marginLeft: -150, borderRadius: 150, background: '#e5763f' }}
            />
            {STICKERS.map((s, i) => (
              <motion.div
                key={s.name}
                initial={reduce ? false : { opacity: 0, scale: 0.4, rotate: 0, y: 40 }}
                animate={{ opacity: 1, scale: 1, rotate: s.rot, y: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 15, delay: 0.1 + i * 0.08 }}
                style={{ position: 'absolute', top: s.top, left: 'left' in s ? s.left : undefined, right: 'right' in s ? s.right : undefined, width: s.w }}
              >
                <div style={{ height: s.w + 12, borderRadius: 26, background: s.bg, color: s.ink, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative' }}>
                  <img src={illustration(s.art)} alt="" width={80} height={80} style={{ position: 'absolute', top: -10, right: -6 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.15 }}>{s.name}</span>
                </div>
              </motion.div>
            ))}
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.4, y: 60 }}
              animate={{ opacity: 1, scale: 1, rotate: -2, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.45 }}
              style={{ position: 'absolute', left: '50%', top: 172, width: 150, marginLeft: -75 }}
            >
              <div style={{ height: 160, borderRadius: 28, background: '#1d1a17', color: '#fff', padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4, position: 'relative', boxShadow: '0 18px 40px rgba(90,30,8,.35)' }}>
                <img src={illustration('topic-ai')} alt="" width={96} height={96} style={{ position: 'absolute', top: -20, right: -12 }} />
                <span className="kicker" style={{ color: '#ffc93d' }}>5 min</span>
                <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.15 }}>Comment une IA apprend à parler</span>
              </div>
            </motion.div>
          </div>
        </div>
        <div style={{ padding: '24px 24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1 className="display" style={{ fontSize: 42, lineHeight: 0.98, letterSpacing: '-0.05em' }}>
            <RevealLines lines={[{ text: 'Apprends tout,' }, { text: '5 min à la fois.', color: 'var(--primary)' }]} delay={0.3} />
          </h1>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="muted" style={{ fontSize: 16, lineHeight: 1.45 }}>
            Dis ce qui t’intrigue. Sipp te prépare un parcours de leçons courtes, rien que pour toi.
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
        <Button variant="dark" onClick={() => nav('/start')} sound="pop">
          Créer mon parcours
        </Button>
        <Button variant="soft" onClick={() => nav('/demo')}>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4.5v15l13-7.5z" fill="var(--primary)" />
          </svg>
          Goûter un Sip · 5 min
        </Button>
        <button onClick={() => nav('/login')} style={{ border: 'none', background: 'none', height: 44, fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>
          J’ai déjà un compte
        </button>
      </motion.div>
    </Screen>
  )
}
