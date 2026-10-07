import { AnimatePresence, motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { Mascot } from './Mascot'
import { Button } from './ui'

/** Bottom sheet asking to confirm a destructive action. Rendered over the whole app. */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const root = document.querySelector('.app')
  if (!root) return null
  return createPortal(
    <AnimatePresence>
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
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag={busy ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => i.offset.y > 80 && onClose()}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 41,
              background: 'var(--bg)',
              borderRadius: '34px 34px 0 0',
              padding: '12px 22px calc(var(--safe-bottom) + 24px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              textAlign: 'center',
              boxShadow: 'none',
            }}
          >
            <span style={{ width: 44, height: 5, borderRadius: 3, background: 'var(--shadow-dark)' }} />
            <Mascot mood="think" size={64} />
            <h2 className="title-m">{title}</h2>
            <p className="muted" style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.45, maxWidth: 320 }}>
              {message}
            </p>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              <Button onClick={onConfirm} disabled={busy} style={{ background: 'var(--rose-ink)', color: '#fff' }}>
                {busy ? '…' : confirmLabel}
              </Button>
              <Button variant="ghost" onClick={onClose} disabled={busy} style={{ height: 48, fontSize: 16 }}>
                Annuler
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    root,
  )
}
