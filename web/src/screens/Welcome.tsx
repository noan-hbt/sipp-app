import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { illustration } from '../components/SipIcon'
import { Confetti } from './ProgramView'
import { Button } from '../components/ui'

/** First visit: the promise, then try before signing up. */
export function Welcome() {
  const nav = useNavigate()
  return (
    <Screen kind="fade">
      <div className="scroll" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', minHeight: 380, flex: 1, borderRadius: '0 0 44px 44px', background: '#FFD7BD', display: 'grid', placeItems: 'center', padding: 'calc(var(--safe-top) + 30px) 0 20px', overflow: 'hidden' }}>
          <Confetti />
          <motion.img
            src={illustration('scene-welcome')}
            alt=""
            width={300}
            height={300}
            initial={{ scale: 0.6, rotate: -6, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 14 }}
            style={{ position: 'relative', maxWidth: '82%', height: 'auto' }}
          />
        </div>
        <div style={{ padding: '22px 24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="display" style={{ fontSize: 34, lineHeight: 1.04 }}>
            Apprends ce que tu veux, cinq minutes à la fois.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="muted" style={{ fontSize: 16, lineHeight: 1.45 }}>
            Dis à Sipp ce qui t’intéresse, il te prépare des leçons courtes faites pour toi.
          </motion.p>
        </div>
      </div>
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.35 }}
        className="bottom-bar"
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <Button onClick={() => nav('/start')} sound="pop">
          Créer mon parcours
        </Button>
        <Button variant="soft" onClick={() => nav('/demo')}>
          Goûter un Sip · 5 min
        </Button>
        <button onClick={() => nav('/login')} style={{ border: 'none', background: 'none', height: 44, fontSize: 15, fontWeight: 600, color: 'var(--primary)' }}>
          J’ai déjà un compte
        </button>
      </motion.div>
    </Screen>
  )
}
