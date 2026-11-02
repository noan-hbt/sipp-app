import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useNavigationType } from 'react-router-dom'
import { COL, type ColWidth } from '../lib/layout'

type Kind = 'push' | 'modal' | 'fade'

/** Animated page container. Push screens slide, lessons rise like a sheet. */
/** On large screens the background fills the display and the content sits in a centered column of `width`. */
export function Screen({ children, kind = 'push', bg, width = 'regular' }: { children: ReactNode; kind?: Kind; bg?: string; width?: ColWidth }) {
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
      style={{ ...(bg ? { background: bg } : null), ['--col' as string]: COL[width] }}
      {...variants}
      transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.9 }}
    >
      {children}
    </motion.div>
  )
}
