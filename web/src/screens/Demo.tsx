import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button } from '../components/ui'
import { DEMO_LESSON } from '../demo/demoLesson'
import { play } from '../lib/sound'
import { doneInfo, LessonPlayer, type Finished } from './Lesson'
import { mastered, Takeaways } from './LessonDone'

/** A real lesson, hand-written, playable without an account. */
export function Demo() {
  const nav = useNavigate()
  const [done, setDone] = useState<Finished | null>(null)

  if (!done) {
    return (
      <LessonPlayer
        title={DEMO_LESSON.title}
        blocks={DEMO_LESSON.blocks}
        onClose={() => nav(-1)}
        onFinish={(f) => {
          play('complete')
          setDone(f)
        }}
        finishing={false}
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
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} style={{ fontSize: 16, fontWeight: 600, textAlign: 'center', lineHeight: 1.45 }}>
          Et maintenant, le sujet de ton choix ? Je te prépare un parcours sur mesure, gratuitement.
        </motion.p>
      </div>
      <div className="bottom-bar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button onClick={() => nav('/start', { replace: true })} sound="pop">
          Créer mon parcours
        </Button>
        <Button variant="ghost" style={{ height: 48, fontSize: 16 }} onClick={() => nav('/', { replace: true })}>
          Plus tard
        </Button>
      </div>
    </Screen>
  )
}
