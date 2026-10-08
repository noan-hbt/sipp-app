import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { SipIcon } from '../components/SipIcon'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, ApiError, type Interpretation, type Profile } from '../lib/api'
import { play } from '../lib/sound'
import { NEW_SIP_ERRORS } from './NewSip'

const LEVELS = [
  { label: 'Débutant', value: 'beginner', matches: ['none', 'beginner'] },
  { label: 'J’ai des bases', value: 'intermediate', matches: ['intermediate'] },
  { label: 'Avancé', value: 'advanced', matches: ['advanced', 'expert'] },
]

export interface UnderstoodState {
  input: string
  interpretation: Interpretation
}

/** What Sipp understood of the request, to confirm or adjust before the path is built. */
export function Understood() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const state = useLocation().state as UnderstoodState | null
  const [profile, setProfile] = useState<Profile | null>(() => state?.interpretation.profile ?? null)
  const [editingGoal, setEditingGoal] = useState(false)

  const create = useMutation({
    mutationFn: () => Api.createSip(state!.input, profile!),
    onSuccess: (sip) => {
      play('whoosh')
      void qc.invalidateQueries({ queryKey: ['sips'] })
      void qc.invalidateQueries({ queryKey: ['plan'] })
      nav(`/sips/${sip.id}/building`, { replace: true })
    },
    onError: () => play('wrong'),
  })

  if (!state || !profile) return <Navigate to="/new" replace />
  const { interpretation, input } = state
  const update = (patch: Partial<Profile>) => setProfile((p) => (p ? { ...p, ...patch } : p))
  const goal = profile.goals[0] ?? ''
  const known = profile.prior_knowledge ?? []
  const left = profile.out_of_scope ?? []
  const err = create.error instanceof ApiError ? (NEW_SIP_ERRORS[create.error.code ?? ''] ?? 'Oups, réessaie dans un instant.') : create.error ? 'Impossible de joindre Sipp.' : null

  return (
    <Screen>
      <header className="topbar">
        <IconButton label="Retour" onClick={() => nav('/new', { replace: true, state: { text: input } })}>
          {Icon.back}
        </IconButton>
      </header>

      <div className="scroll" style={{ padding: '4px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 58, height: 58, borderRadius: 29, background: 'var(--peach-soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Mascot size={44} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>Avant de préparer ton parcours</span>
            <h1 className="title-l" style={{ fontSize: 25 }}>
              Voilà ce que j’ai compris
            </h1>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card" style={{ borderRadius: 24, padding: 16, display: 'flex', gap: 14, alignItems: 'center' }}>
          <SipIcon text={`${profile.topic} ${input}`} size={64} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--peach-ink)' }}>Ton sujet</span>
            <span style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.25 }}>{profile.title}</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card" style={{ borderRadius: 24, padding: '4px 16px', display: 'flex', flexDirection: 'column' }}>
          <Row label="Ton niveau">
            <div role="radiogroup" aria-label="Ton niveau" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {LEVELS.map((l) => {
                const on = l.matches.includes(profile.current_level)
                return (
                  <motion.button
                    key={l.value}
                    role="radio"
                    aria-checked={on}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => {
                      play('tap')
                      update({ current_level: l.value })
                    }}
                    style={{ height: 36, padding: '0 14px', borderRadius: 18, border: 'none', background: on ? 'var(--primary)' : 'var(--bg-deep)', color: on ? '#fff' : 'var(--ink-soft)', fontSize: 14, fontWeight: on ? 600 : 500 }}
                  >
                    {l.label}
                  </motion.button>
                )
              })}
            </div>
          </Row>

          <Row label="Ton objectif">
            {editingGoal ? (
              <textarea
                aria-label="Ton objectif"
                autoFocus
                rows={2}
                maxLength={300}
                value={goal}
                onChange={(e) => update({ goals: [e.target.value, ...profile.goals.slice(1)] })}
                onBlur={() => {
                  if (!goal.trim()) update({ goals: interpretation.profile.goals })
                  setEditingGoal(false)
                }}
                style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'var(--bg-deep)', borderRadius: 14, padding: '8px 10px', fontSize: 16, lineHeight: 1.4, fontFamily: 'inherit' }}
              />
            ) : (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ flex: 1, fontSize: 16, lineHeight: 1.4 }}>{goal}</span>
                <button
                  aria-label="Modifier l’objectif"
                  onClick={() => setEditingGoal(true)}
                  style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: 'var(--bg-deep)', color: 'var(--muted)', display: 'grid', placeItems: 'center', flexShrink: 0 }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z" />
                  </svg>
                </button>
              </div>
            )}
          </Row>

          {known.length > 0 && (
            <Row label="Tu sais déjà">
              <Chips items={known} tone="mint" onRemove={(i) => update({ prior_knowledge: known.filter((_, j) => j !== i) })} removeLabel="Retirer" />
            </Row>
          )}

          {left.length > 0 && (
            <Row label="On laisse de côté" last>
              <Chips items={left} tone="neutral" onRemove={(i) => update({ out_of_scope: left.filter((_, j) => j !== i) })} removeLabel="Inclure" />
            </Row>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} style={{ borderRadius: 20, background: 'var(--butter)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--butter-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2M9 2h6" />
          </svg>
          <span style={{ fontSize: 15, lineHeight: 1.35, color: 'var(--butter-ink)' }}>
            {interpretation.program ? (
              <>
                <b style={{ fontWeight: 600 }}>Un grand objectif</b> : je le découpe en chapitres, à suivre un par un.
              </>
            ) : (
              <>
                <b style={{ fontWeight: 600 }}>
                  {interpretation.lessons_min} à {interpretation.lessons_max} leçons
                </b>{' '}
                de 5 minutes
              </>
            )}
          </span>
        </motion.div>

        <AnimatePresence>
          {err && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 20, background: 'var(--rose-soft)' }}>
              <Mascot mood="oops" size={40} />
              <p style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4, color: 'var(--rose-ink)' }}>{err}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bottom-bar" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Button disabled={create.isPending} onClick={() => create.mutate()} sound="pop">
          {create.isPending ? <Mascot mood="think" size={36} /> : 'C’est bien ça, on y va'}
        </Button>
        <Button variant="ghost" style={{ height: 44, fontSize: 16 }} onClick={() => nav('/new', { replace: true, state: { text: input } })}>
          Préciser autre chose
        </Button>
      </div>
    </Screen>
  )
}

function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderBottom: last ? 'none' : '1.5px solid var(--bg-deep)' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>{label}</span>
      {children}
    </div>
  )
}

function Chips({ items, tone, onRemove, removeLabel }: { items: string[]; tone: 'mint' | 'neutral'; onRemove: (i: number) => void; removeLabel: string }) {
  const bg = tone === 'mint' ? 'var(--mint)' : 'var(--bg-deep)'
  const ink = tone === 'mint' ? 'var(--mint-ink)' : 'var(--muted)'
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <AnimatePresence initial={false}>
        {items.map((t, i) => (
          <motion.span
            key={t}
            layout
            exit={{ opacity: 0, scale: 0.8 }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 4px 4px 11px', borderRadius: 14, background: bg, color: ink, fontSize: 13, fontWeight: 600 }}
          >
            {t}
            <button
              aria-label={`${removeLabel} : ${t}`}
              onClick={() => {
                play('tap')
                onRemove(i)
              }}
              style={{ width: 28, height: 28, borderRadius: 14, border: 'none', background: 'rgba(255,255,255,.7)', color: ink, display: 'grid', placeItems: 'center' }}
            >
              {Icon.cross(10)}
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  )
}
