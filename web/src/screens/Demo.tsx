import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { RevealLines } from '../components/motion'
import { Screen } from '../components/Screen'
import { sipPalette, topicArt } from '../components/SipIcon'
import { Button, Icon, IconButton } from '../components/ui'
import { DEMO_LESSON, DEMO_PATH } from '../demo/demoLesson'
import { play } from '../lib/sound'
import { doneInfo, LessonPlayer, type Finished } from './Lesson'
import { mastered, Takeaways } from './LessonDone'

const THEME = 'sleep'

/** A real lesson, hand-written, playable without an account. It opens on the request it answers, so the visitor sees it as one example of what Sipp writes. */
export function Demo() {
  const nav = useNavigate()
  const [playing, setPlaying] = useState(false)
  const [done, setDone] = useState<Finished | null>(null)

  if (!playing) return <Intro onClose={() => nav(-1)} onStart={() => setPlaying(true)} />

  if (!done) {
    return (
      <LessonPlayer
        title={DEMO_LESSON.title}
        blocks={DEMO_LESSON.blocks}
        onClose={() => setPlaying(false)}
        onFinish={(f) => {
          play('complete')
          setDone(f)
        }}
        finishing={false}
        art={topicArt(DEMO_LESSON.sip_title, THEME)}
      />
    )
  }

  const info = doneInfo(DEMO_LESSON)
  return (
    <Screen kind="fade">
      <div className="scroll" style={{ padding: 'calc(var(--safe-top) + 40px) 22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
          <motion.div initial={{ scale: 0, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }}>
            <Mascot mood="bravo" size={96} />
          </motion.div>
          <h1 className="title-xl">Premier Sip bu !</h1>
          {done.total > 0 && (
            <p className="muted" style={{ fontSize: 15, fontWeight: 500 }}>
              {done.correct} bonne{done.correct > 1 ? 's' : ''} réponse{done.correct > 1 ? 's' : ''} sur {done.total}
            </p>
          )}
        </div>
        <Takeaways objective={info.objective} points={info.points} action={info.action} mastered={mastered(done.correct, done.total)} delay={0.3} />
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'center' }}>
          <p style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4 }}>À toi : tu veux apprendre quoi ?</p>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
            Cette leçon répondait à une demande sur le café. Dis-moi ton sujet, n’importe lequel : j’écris ton parcours, gratuitement.
          </p>
        </motion.div>
      </div>
      <div className="bottom-bar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button onClick={() => nav('/start', { replace: true })} sound="pop">
          Choisir mon sujet
        </Button>
        <Button variant="ghost" style={{ height: 48, fontSize: 16 }} onClick={() => nav('/', { replace: true })}>
          Plus tard
        </Button>
      </div>
    </Screen>
  )
}

/** Someone's request, the path Sipp built for it, and the lesson about to be played, marked on that path. */
function Intro({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  const pal = sipPalette(DEMO_LESSON.sip_title, THEME)
  return (
    <Screen kind="fade">
      <header className="topbar">
        <IconButton label="Fermer" onClick={onClose}>
          {Icon.close}
        </IconButton>
      </header>
      <div className="scroll" style={{ padding: '4px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="kicker" style={{ color: 'var(--muted)' }}>Un exemple</span>
          <h1 className="display" style={{ fontSize: 36, lineHeight: 0.98, letterSpacing: '-0.05em' }}>
            <RevealLines lines={[{ text: 'Quelqu’un a écrit' }, { text: 'à Sipp :', color: 'var(--primary)' }]} />
          </h1>
        </div>

        <motion.blockquote
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="display"
          style={{ margin: 0, borderRadius: 24, padding: '16px 18px', background: 'var(--dock)', color: 'var(--dock-ink)', fontSize: 20, lineHeight: 1.25 }}
        >
          « {DEMO_PATH.wish} »
        </motion.blockquote>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>
          Sipp lui a écrit ce parcours :
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.45 }}
          style={{ borderRadius: 26, padding: 14, background: pal.bg, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={topicArt(DEMO_LESSON.sip_title, THEME)} alt="" width={52} height={52} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="display" style={{ fontSize: 19, lineHeight: 1.1 }}>{DEMO_LESSON.sip_title}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: pal.ink }}>
                {DEMO_PATH.modules.length} modules · {DEMO_PATH.lessons} leçons de 5 min
              </span>
            </div>
          </div>
          {DEMO_PATH.modules.map((m, k) => (
            <div key={m.title} style={{ borderRadius: 16, padding: '8px 10px', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, background: pal.ink, color: 'var(--surface)', fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{k + 1}</span>
                {m.title}
              </span>
              {m.lessons.map((l, j) => {
                const here = k === 0 && j === 0
                return (
                  <span
                    key={l}
                    style={{ marginLeft: 30, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14, fontWeight: here ? 700 : 500, color: here ? 'var(--ink)' : 'var(--muted)' }}
                  >
                    {l}
                    {here && <span style={{ padding: '3px 9px', borderRadius: 10, background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700 }}>Tu vas jouer celle-ci</span>}
                  </span>
                )
              })}
            </div>
          ))}
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
          Le café, c’était son sujet. Après, ce sera le tien : n’importe lequel.
        </motion.p>
      </div>
      <div className="bottom-bar">
        <Button onClick={onStart} sound="pop">
          Jouer la leçon · 5 min
        </Button>
      </div>
    </Screen>
  )
}
