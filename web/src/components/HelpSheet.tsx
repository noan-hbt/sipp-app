import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { ApiError, type HelpKind } from '../lib/api'
import { play } from '../lib/sound'
import { useModal } from '../lib/useModal'
import { Mascot } from './Mascot'
import { RichText } from './RichText'
import { Button } from './ui'

const KINDS: [HelpKind, string][] = [
  ['rephrase', 'Explique autrement'],
  ['simpler', 'Plus simple'],
  ['example', 'Un exemple'],
  ['word', 'Un mot inconnu'],
]

const TITLES: Record<HelpKind, string> = {
  rephrase: 'Autrement dit',
  simpler: 'Plus simplement',
  example: 'Un exemple',
  word: 'Les mots clés',
  question: 'Ta question',
}

export type AskHelp = (kind: HelpKind, question?: string) => Promise<string>

/** "I don't understand": another explanation of the block on screen, without leaving the lesson. */
export function HelpSheet({ open, onClose, ask }: { open: boolean; onClose: () => void; ask: AskHelp }) {
  const { dialog, onKeyDown } = useModal(open)
  const [question, setQuestion] = useState('')
  const help = useMutation({
    mutationFn: ({ kind, q }: { kind: HelpKind; q?: string }) => ask(kind, q),
    onSuccess: () => play('reveal'),
  })
  const kind = help.variables?.kind
  const err =
    help.error instanceof ApiError && help.error.code === 'help_limit'
      ? 'Tu m’as beaucoup sollicité aujourd’hui. On en reparle demain ?'
      : help.error
        ? 'Je n’arrive pas à répondre pour l’instant. Réessaie dans un instant.'
        : null

  function close() {
    help.reset()
    setQuestion('')
    onClose()
  }

  return (
    <dialog
      ref={dialog}
      className="sheet-modal"
      aria-label="Aide sur ce passage"
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
    >
    <AnimatePresence onExitComplete={() => dialog.current?.close()}>
      {open && (
        <>
          <motion.div key="veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(29,26,23,.38)' }} />
          <motion.section
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 21, maxHeight: '88%', overflowY: 'auto', borderRadius: '32px 32px 0 0', background: 'var(--bg)', padding: '10px 18px calc(var(--safe-bottom) + 22px)', display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <span aria-hidden="true" style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, background: 'var(--line-strong)', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 48, height: 48, borderRadius: 24, background: 'var(--surface)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Mascot mood={help.isPending ? 'think' : 'hello'} size={38} />
              </span>
              <h2 className="title-m">Qu’est-ce qui coince ?</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {KINDS.map(([k, label]) => {
                const on = kind === k && !help.isIdle
                return (
                  <motion.button
                    key={k}
                    whileTap={{ scale: 0.96 }}
                    disabled={help.isPending}
                    aria-pressed={on}
                    onClick={() => {
                      play('tap')
                      help.mutate({ kind: k })
                    }}
                    style={{
                      minHeight: 52,
                      border: 'none',
                      borderRadius: 18,
                      fontSize: 15,
                      fontWeight: 600,
                      background: on ? 'var(--lavender)' : 'var(--surface)',
                      color: on ? 'var(--lavender-ink)' : 'var(--ink)',
                      boxShadow: on ? 'inset 0 0 0 2.5px var(--lavender-strong)' : 'inset 0 0 0 2px var(--line)',
                    }}
                  >
                    {label}
                  </motion.button>
                )
              })}
            </div>

            <AnimatePresence mode="wait">
              {help.isPending ? (
                <motion.p key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="lx-small" style={{ textAlign: 'center', padding: '8px 0' }}>
                  Je cherche une meilleure façon de le dire…
                </motion.p>
              ) : help.data && kind ? (
                <motion.div key={help.submittedAt} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ borderRadius: 22, background: 'var(--surface)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--lavender-ink)' }}>{TITLES[kind]}</span>
                  <p className="lx-p" style={{ fontSize: 16 }}>
                    <RichText text={help.data} />
                  </p>
                </motion.div>
              ) : err ? (
                <motion.p key="err" role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: 15, color: 'var(--rose-ink)', background: 'var(--rose-soft)', borderRadius: 18, padding: '10px 14px' }}>
                  {err}
                </motion.p>
              ) : null}
            </AnimatePresence>

            <form
              className="help-question"
              onSubmit={(e) => {
                e.preventDefault()
                const q = question.trim()
                if (!q || help.isPending) return
                play('pop')
                help.mutate({ kind: 'question', q })
                setQuestion('')
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 6px 0 16px', borderRadius: 26, background: 'var(--surface)', boxShadow: 'inset 0 0 0 2px var(--line)' }}
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={500}
                placeholder="Ou pose ta question…"
                aria-label="Ta question"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 16 }}
              />
              <button
                type="submit"
                aria-label="Envoyer"
                disabled={!question.trim() || help.isPending}
                style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: question.trim() ? 'var(--primary)' : 'var(--bg-deep)', color: question.trim() ? '#fff' : 'var(--faint)', display: 'grid', placeItems: 'center', flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </form>

            <Button variant="dark" onClick={close}>
              {help.data ? 'C’est plus clair, je reprends' : 'Retour à la leçon'}
            </Button>
          </motion.section>
        </>
      )}
    </AnimatePresence>
    </dialog>
  )
}
