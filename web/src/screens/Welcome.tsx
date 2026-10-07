import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button } from '../components/ui'

/** First visit: the promise, then try before signing up. */
export function Welcome() {
  const nav = useNavigate()
  return (
    <Screen kind="fade">
      <div className="scroll" style={{ padding: 'calc(var(--safe-top) + 56px) 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="raised"
          style={{ width: 168, height: 168, borderRadius: 84, display: 'grid', placeItems: 'center', marginBottom: 10 }}
        >
          <Mascot mood="hello" size={124} />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          Apprends ce qui t’intéresse, cinq minutes à la fois.
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="muted" style={{ fontSize: 17, fontWeight: 700, maxWidth: 320 }}>
          Dis-moi ce que tu veux savoir. Je construis ton parcours, une petite gorgée par jour.
        </motion.p>
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
          Goûter un Sip · 3 min
        </Button>
        <button onClick={() => nav('/login')} style={{ border: 'none', background: 'none', height: 44, fontSize: 15, fontWeight: 800, color: 'var(--muted)' }}>
          J’ai déjà un compte
        </button>
      </motion.div>
    </Screen>
  )
}
