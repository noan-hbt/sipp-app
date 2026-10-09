import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from '../lib/useModal'

/** A modal sheet sliding from the bottom, rendered over the whole app. */
export function BottomSheet({ open, label, busy, onClose, children }: {
  open: boolean
  label: string
  busy?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const { dialog, onKeyDown } = useModal(open)
  const root = document.querySelector('.app')
  if (!root) return null
  return createPortal(
    <dialog
      ref={dialog}
      className="sheet-modal"
      aria-label={label}
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
    >
      <AnimatePresence onExitComplete={() => dialog.current?.close()}>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={busy ? undefined : onClose}
              style={{ position: 'absolute', inset: 0, background: 'rgba(29,26,23,.45)', zIndex: 40 }}
            />
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 41, background: 'var(--bg)',
                borderRadius: '34px 34px 0 0', padding: '12px 20px calc(var(--safe-bottom) + 22px)',
                display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '92%', overflowY: 'auto',
              }}
            >
              <span style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, background: 'var(--shadow-dark)' }} />
              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </dialog>,
    root,
  )
}
