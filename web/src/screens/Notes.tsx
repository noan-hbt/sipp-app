import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { illustration, sipPalette } from '../components/SipIcon'
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
        <img src={illustration('scene-notes')} alt="" width={160} height={160} />
        <span className="display" style={{ fontSize: 21 }}>Aucune note pour l’instant</span>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
          Pendant une leçon, appuie longuement sur un passage qui te plaît : il viendra se ranger ici.
        </p>
      </div>
    )
  }

  // Two staggered columns of sticky notes, newest first, each in its Sip's colour.
  const cols: Note[][] = [[], []]
  notes.data.forEach((n, i) => cols[i % 2].push(n))

  return (
    <div className="scroll" style={{ padding: '18px 16px 130px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {cols.map((col, c) => (
          <div key={c} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, paddingTop: c ? 28 : 0 }}>
            <AnimatePresence initial={false}>
              {col.map((n, i) => {
                const pal = sipPalette(n.sip_title)
                const tilt = (c + i) % 2 ? 1.4 : -1.4
                return (
                  <motion.article
                    key={n.id}
                    layout
                    initial={{ opacity: 0, y: 16, rotate: 0, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, rotate: tilt, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20, delay: (i * 2 + c) * 0.04 }}
                    style={{ borderRadius: 24, padding: '16px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: pal.bg }}
                  >
                    <span aria-hidden="true" className="display" style={{ fontSize: 46, lineHeight: 0.5, height: 18, color: pal.ink, opacity: 0.45 }}>“</span>
                    <p style={{ fontSize: 15, lineHeight: 1.45, fontWeight: 500, color: 'var(--ink)', userSelect: 'text', WebkitUserSelect: 'text', overflowWrap: 'anywhere' }}>{n.quote}</p>
                    {n.text && <p style={{ fontSize: 13, color: 'var(--muted)' }}>{n.text}</p>}
                    <button
                      type="button"
                      onClick={() => {
                        play('tap')
                        nav(`/lessons/${n.lesson_id}`)
                      }}
                      style={{ border: 'none', background: 'none', padding: 0, fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: pal.ink, textAlign: 'left' }}
                    >
                      {n.sip_title} · {n.lesson_title} →
                    </button>
                    <button
                      type="button"
                      aria-label="Retirer cette note"
                      onClick={() => remove.mutate(n.id)}
                      style={{ alignSelf: 'flex-start', border: 'none', background: 'var(--frost)', borderRadius: 14, padding: '6px 10px', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}
                    >
                      Retirer
                    </button>
                  </motion.article>
                )
              })}
            </AnimatePresence>
          </div>
        ))}
      </div>
      <p style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, lineHeight: 1.4, color: 'var(--muted)', margin: '6px 4px 0' }}>
        <img src={illustration('scene-notes')} alt="" width={48} height={48} style={{ flexShrink: 0 }} />
        Dans une leçon, appuie longuement sur un passage pour le garder ici.
      </p>
    </div>
  )
}
