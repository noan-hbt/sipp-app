import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { illustration } from '../components/SipIcon'
import { Api, type Note } from '../lib/api'
import { play } from '../lib/sound'

/** Passages kept from lessons, grouped by Sip, newest first. */
export function Notes() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const notes = useQuery({ queryKey: ['notes'], queryFn: Api.notes })
  const remove = useMutation({
    mutationFn: Api.deleteNote,
    onMutate: (id) => qc.setQueryData<Note[]>(['notes'], (all) => all?.filter((n) => n.id !== id)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
  const error = (notes.isError || notes.isPaused) && (
    <ErrorNotice message={notes.isPaused ? 'Tu es hors ligne. Reconnecte-toi pour actualiser tes notes.' : 'Impossible d’actualiser tes notes. Réessaie.'} retry={() => { void notes.refetch() }} busy={notes.isFetching} />
  )
  if (!notes.data) return <div className="scroll" style={{ padding: '12px 16px 130px' }}>{error || <p className="muted" role="status">Chargement de tes notes…</p>}</div>

  if (!notes.data.length) {
    return (
      <div className="scroll" style={{ padding: '40px 32px 130px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        {error}
        <img src={illustration('scene-empty')} alt="" width={160} height={160} />
        <span className="display" style={{ fontSize: 21 }}>Aucune note pour l’instant</span>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
          Pendant une leçon, touche « Garder » sous un passage qui te plaît : il viendra se ranger ici.
        </p>
      </div>
    )
  }

  const groups = new Map<string, { title: string; notes: Note[] }>()
  for (const n of notes.data) {
    const g = groups.get(n.sip_id) ?? { title: n.sip_title, notes: [] }
    g.notes.push(n)
    groups.set(n.sip_id, g)
  }

  return (
    <div className="scroll" style={{ padding: '12px 16px 130px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error}
      {[...groups.entries()].map(([sipId, g]) => (
        <section key={sipId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '8px 4px 0' }}>{g.title}</h2>
          <AnimatePresence initial={false}>
            {g.notes.map((n) => (
              <motion.article
                key={n.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: -8 }}
                className="card"
                style={{ borderRadius: 20, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', borderLeft: '4px solid var(--sun)' }}
              >
                <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--ink-soft)', userSelect: 'text', WebkitUserSelect: 'text' }}>{n.quote}</p>
                {n.text && <p style={{ fontSize: 14, color: 'var(--muted)' }}>{n.text}</p>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      play('tap')
                      nav(`/lessons/${n.lesson_id}`)
                    }}
                    style={{ border: 'none', background: 'none', padding: 0, fontSize: 13, fontWeight: 600, color: 'var(--primary)', textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {n.lesson_title} →
                  </button>
                  <button
                    type="button"
                    aria-label="Retirer cette note"
                    onClick={() => remove.mutate(n.id)}
                    style={{ border: 'none', background: 'none', padding: 4, fontSize: 13, fontWeight: 600, color: 'var(--faint)', flexShrink: 0 }}
                  >
                    Retirer
                  </button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </section>
      ))}
    </div>
  )
}
