import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, ApiError } from '../lib/api'
import { play } from '../lib/sound'

const IDEAS = [
  { label: 'La photo au smartphone', hint: 'Cadrer, la lumière, retoucher', text: 'Je veux apprendre les bases de la photo avec mon téléphone', bg: 'var(--lavender)', ink: 'var(--lavender-ink)' },
  { label: 'Lire un bilan', hint: 'Actif, passif, résultat', text: 'Je veux savoir lire le bilan comptable d’une entreprise, je pars de zéro', bg: 'var(--mint)', ink: 'var(--mint-ink)' },
  { label: 'Mieux dormir', hint: 'Cycles, horloge, habitudes', text: 'Je veux comprendre comment fonctionne le sommeil et comment mieux dormir', bg: 'var(--sky)', ink: 'var(--sky-ink)' },
  { label: 'La Rome antique', hint: 'De la fondation à la chute', text: 'Je veux connaître les grandes étapes de l’histoire de la Rome antique', bg: 'var(--butter)', ink: 'var(--butter-ink)' },
  { label: 'Créer sa boîte', hint: 'Un vrai programme en chapitres', text: 'Je veux apprendre à créer et diriger une petite entreprise', bg: 'var(--peach-soft)', ink: 'var(--peach-ink)' },
]

/** One-tap details that help the AI aim right; each appends or removes its phrase. */
const DETAILS = [
  { label: 'Je pars de zéro', text: 'je pars de zéro', group: 'level' },
  { label: 'J’ai des bases', text: 'j’ai déjà des bases', group: 'level' },
  { label: 'Pour mon travail', text: 'c’est pour mon travail', group: 'why' },
  { label: 'Par curiosité', text: 'c’est par curiosité', group: 'why' },
  { label: 'Le plus concret possible', text: 'avec des exemples très concrets', group: 'style' },
]

const PLACEHOLDERS = [
  'comprendre comment marche l’inflation…',
  'parler de vin sans me ridiculiser…',
  'apprendre les bases de Python pour mon boulot…',
  'comprendre la mécanique quantique, simplement…',
]

const ERRORS: Record<string, string> = {
  daily_budget_reached: 'J’ai assez réfléchi pour aujourd’hui. On reprend demain ?',
  too_many_active_builds: 'Je construis déjà plusieurs parcours. Attends qu’ils soient prêts.',
  no_free_slot: 'Ta bibliothèque est pleine. Libère un emplacement ou passe à l’abonnement.',
  monthly_limit: 'Tu as utilisé tes générations du mois. Reviens le mois prochain, ou passe à l’abonnement.',
}

export const WISH_KEY = 'sipp.wish'

function hasDetail(text: string, d: string) {
  return text.toLowerCase().includes(d.toLowerCase())
}

function toggleDetail(text: string, d: string) {
  if (hasDetail(text, d)) {
    return text
      .replace(new RegExp(`[,.]?\\s*${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '')
      .trim()
  }
  const t = text.trim().replace(/[.,]$/, '')
  return t ? `${t}, ${d}` : d.charAt(0).toUpperCase() + d.slice(1)
}

/** `guest`: visitor not signed up yet; the wish is kept and the Sip is created right after sign-up. */
export function NewSip({ guest = false }: { guest?: boolean }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const input = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(() => {
    try {
      return sessionStorage.getItem(WISH_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [ph, setPh] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setPh((i) => (i + 1) % PLACEHOLDERS.length), 3200)
    return () => clearInterval(t)
  }, [])

  const plan = useQuery({ queryKey: ['plan'], queryFn: Api.plan, enabled: !guest })
  const trial = useMutation({
    mutationFn: Api.startTrial,
    onSuccess: (p) => {
      play('complete')
      qc.setQueryData(['plan'], p)
      create.reset()
    },
  })
  const create = useMutation({
    mutationFn: Api.createSip,
    onSuccess: (sip) => {
      play('whoosh')
      void qc.invalidateQueries({ queryKey: ['sips'] })
      nav(`/sips/${sip.id}/building`, { replace: true })
    },
    onError: () => play('wrong'),
  })
  const paywall = create.error instanceof ApiError && create.error.status === 402
  const err = create.error instanceof ApiError ? (ERRORS[create.error.code ?? ''] ?? 'Oups, réessaie dans un instant.') : create.error ? 'Impossible de joindre Sipp.' : null
  const ready = text.trim().length >= 3

  function pick(t: string) {
    play('pop')
    setText(t)
    create.reset()
    input.current?.focus()
  }

  function submit() {
    if (guest) {
      try {
        sessionStorage.setItem(WISH_KEY, text.trim())
      } catch {
        /* private mode: the visitor will retype it */
      }
      nav('/signup')
    } else {
      create.mutate(text.trim())
    }
  }

  return (
    <Screen>
      <header className="topbar">
        <IconButton label="Retour" onClick={() => nav(-1)}>
          {Icon.back}
        </IconButton>
      </header>

      <div className="scroll" style={{ padding: '4px 22px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="title-xl">Qu’est-ce que tu veux apprendre ?</h1>
          <p className="muted" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.45 }}>
            Un sujet, un objectif, ton niveau. Je construis le parcours.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={create.isError ? { x: [0, -8, 8, -4, 0], opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card"
          style={{ borderRadius: 26, padding: '16px 18px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <div style={{ position: 'relative' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--muted)', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} aria-hidden="true">
              {!text && 'Je veux '}
              {!text && (
                <AnimatePresence mode="wait">
                  <motion.span key={ph} initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                    {PLACEHOLDERS[ph]}
                  </motion.span>
                </AnimatePresence>
              )}
            </span>
            <textarea
              id="wish"
              ref={input}
              aria-label="Ce que tu veux apprendre"
              rows={4}
              maxLength={4000}
              autoFocus
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (create.isError) create.reset()
              }}
              style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontSize: 20, fontWeight: 800, lineHeight: 1.4, color: 'var(--ink)', padding: 0, fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 10, borderTop: '1px solid rgba(43,38,32,.07)' }}>
            {DETAILS.map((d) => {
              const on = hasDetail(text, d.text)
              return (
                <motion.button
                  key={d.label}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => {
                    play('tap')
                    // Details of the same group are exclusive (e.g. "from zero" vs "some bases").
                    setText((t) =>
                      toggleDetail(
                        DETAILS.filter((o) => o.group === d.group && o !== d && hasDetail(t, o.text)).reduce((acc, o) => toggleDetail(acc, o.text), t),
                        d.text,
                      ),
                    )
                  }}
                  aria-pressed={on}
                  style={{
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 16,
                    border: on ? '1.5px solid var(--peach-lip)' : '1.5px solid rgba(43,38,32,.1)',
                    background: on ? 'var(--peach-soft)' : 'transparent',
                    color: on ? 'var(--peach-ink)' : 'var(--ink-soft)',
                    fontSize: 13,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {on ? Icon.check(12) : <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>}
                  {d.label}
                </motion.button>
              )
            })}
          </div>
        </motion.div>

        <AnimatePresence>
          {err && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 20, background: 'var(--rose-soft)' }}
            >
              <Mascot mood="oops" size={40} />
              <p style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.4, color: '#4A2430' }}>{err}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#9c4a22', textTransform: 'uppercase', letterSpacing: '.06em' }}>En panne d’idée ?</span>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -22px', padding: '2px 22px 8px', scrollSnapType: 'x mandatory', scrollPaddingLeft: 22, scrollbarWidth: 'none' }}>
            {IDEAS.map((idea, i) => (
              <motion.button
                key={idea.label}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.15 + i * 0.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => pick(idea.text)}
                style={{
                  flex: '0 0 auto',
                  width: 150,
                  minHeight: 96,
                  scrollSnapAlign: 'start',
                  border: 'none',
                  borderRadius: 22,
                  padding: '14px 14px',
                  background: idea.bg,
                  color: idea.ink,
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.25 }}>{idea.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, lineHeight: 1.3 }}>{idea.hint}</span>
              </motion.button>
            ))}
          </div>
        </section>
      </div>

      <div className="bottom-bar">
        {paywall && plan.data?.trial_available ? (
          <Button variant="peach" disabled={trial.isPending} onClick={() => trial.mutate()} sound="pop">
            {trial.isPending ? <Mascot mood="think" size={36} /> : `Essayer gratuitement ${plan.data.trial_days} jours`}
          </Button>
        ) : (
          <Button disabled={!ready || create.isPending} onClick={submit} sound="pop">
            {create.isPending ? <Mascot mood="think" size={36} /> : 'Construis mon parcours'}
          </Button>
        )}
        {!guest && plan.data?.lite && !paywall && (
          <p className="muted" style={{ fontSize: 13, fontWeight: 700, textAlign: 'center', marginTop: 10 }}>
            Offre gratuite : un parcours court, préparé avec un modèle plus léger.
          </p>
        )}
      </div>
    </Screen>
  )
}
