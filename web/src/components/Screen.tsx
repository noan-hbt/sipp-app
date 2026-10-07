import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useNavigationType } from 'react-router-dom'

type Kind = 'push' | 'modal' | 'fade'

/** Animated page container. Push screens slide, lessons rise like a sheet. */
export function Screen({ children, kind = 'push', bg }: { children: ReactNode; kind?: Kind; bg?: string }) {
  const back = useNavigationType() === 'POP'
  const dir = back ? -1 : 1
  const variants = {
    push: {
      initial: { x: 60 * dir, opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: -40 * dir, opacity: 0 },
    },
    modal: {
      initial: { y: 80, opacity: 0, scale: 0.98 },
      animate: { y: 0, opacity: 1, scale: 1 },
      exit: { y: 60, opacity: 0 },
    },
    fade: {
      initial: { opacity: 0, scale: 0.98 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0 },
    },
  }[kind]
  return (
    <motion.div
      className="screen"
      style={bg ? { background: bg } : undefined}
      {...variants}
      transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.9 }}
    >
      {children}
    </motion.div>
  )
}
