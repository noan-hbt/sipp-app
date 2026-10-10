import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { RevealLines } from '../components/motion'
import { sipPalette, topicArt } from '../components/SipIcon'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, ApiError } from '../lib/api'
import { play } from '../lib/sound'
import { track } from '../lib/telemetry'

const IDEAS = [
  { label: 'Créer sa boîte', hint: 'Un vrai programme en chapitres', text: 'Je veux apprendre à créer et diriger une petite entreprise' },
  { label: 'Lire un bilan', hint: 'Actif, passif, résultat', text: 'Je veux savoir lire le bilan comptable d’une entreprise, je pars de zéro' },
  { label: 'Mieux dormir', hint: 'Cycles, horloge, habitudes', text: 'Je veux comprendre comment fonctionne le sommeil et comment mieux dormir' },
  { label: 'Parler italien', hint: 'Les phrases du quotidien', text: 'Je veux tenir une conversation simple en italien' },
  { label: 'Coder en Python', hint: 'Les bases, pas à pas', text: 'Je veux apprendre les bases de la programmation en Python' },
  { label: 'L’univers', hint: 'Du Big Bang aux trous noirs', text: 'Je veux comprendre l’univers, du Big Bang aux trous noirs' },
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

export const NEW_SIP_ERRORS: Record<string, string> = {
  daily_budget_reached: 'J’ai assez réfléchi pour aujourd’hui. On reprend demain ?',
  too_many_active_builds: 'Je construis déjà plusieurs parcours. Attends qu’ils soient prêts.',
  no_free_slot: 'Ta bibliothèque est pleine. Libère un emplacement ou passe à l’abonnement.',
  monthly_limit: 'Tu as utilisé tes générations du mois. Reviens le mois prochain, ou passe à l’abonnement.',
  llm_unavailable: 'Je n’arrive pas à réfléchir pour l’instant. Réessaie dans un instant.',
}

const remaining = (n: number) => (n > 1 ? `${n} créations restantes` : n === 1 ? '1 création restante' : 'Plus de création ce mois-ci')

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
  const back = useLocation().state as { text?: string } | null
  const input = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(() => {
    if (back?.text) return back.text
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
      track('trial_started', { from: 'new_sip' })
      play('complete')
      qc.setQueryData(['plan'], p)
      create.reset()
    },
  })
  // First what Sipp understood, confirmed on the next screen; the Sip is created there.
  const create = useMutation({
    mutationFn: (wish: string) => Api.interpret(wish).then((interpretation) => ({ input: wish, interpretation })),
    onSuccess: (understood) => {
      play('pop')
      nav('/new/confirm', { state: understood })
    },
    onError: () => play('wrong'),
  })
  const paywall = create.error instanceof ApiError && create.error.status === 402
  const err = create.error instanceof ApiError ? (NEW_SIP_ERRORS[create.error.code ?? ''] ?? 'Oups, réessaie dans un instant.') : create.error ? 'Impossible de joindre Sipp.' : null
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
      <header className="topbar" style={{ justifyContent: 'space-between' }}>
        <IconButton label="Fermer" onClick={() => nav(-1)}>
          {Icon.close}
        </IconButton>
        {!guest && plan.data && plan.data.sips_per_month < 1000 && (
          <span style={{ height: 34, padding: '0 14px', borderRadius: 17, background: 'var(--surface)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: plan.data.sips_per_month > plan.data.sips_this_month ? 'var(--mint-lip)' : 'var(--rose-ink)' }} />
            {remaining(plan.data.sips_per_month - plan.data.sips_this_month)}
          </span>
        )}
      </header>

      <div className="scroll" style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px' }}>
          <h1 className="display" style={{ fontSize: 42, lineHeight: 0.98, letterSpacing: '-0.05em' }}>
            <RevealLines lines={[{ text: 'Qu’est-ce' }, { text: 'qu’on apprend ?', color: 'var(--primary)' }]} />
          </h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
            Ton sujet, ton niveau, et pourquoi. Je te prépare un Sip ou un programme sur mesure.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={create.isError ? { x: [0, -8, 8, -4, 0], opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="wish-box"
          style={{ borderRadius: 28, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--dock)', color: 'var(--dock-ink)' }}
        >
          <label htmlFor="wish" className="kicker" style={{ color: 'var(--dock-kicker)' }}>
            Je veux…
          </label>
          <div style={{ position: 'relative' }}>
            <span className="display" style={{ fontSize: 23, lineHeight: 1.2, color: 'var(--dock-muted)', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} aria-hidden="true">
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
              rows={3}
              maxLength={4000}
              autoFocus
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (create.isError) create.reset()
              }}
              className="display"
              style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontSize: 23, lineHeight: 1.2, color: 'var(--dock-ink)', caretColor: 'var(--dock-ink)', padding: 0 }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
                    height: 34,
                    padding: '0 12px',
                    borderRadius: 17,
                    border: 'none',
                    background: on ? 'var(--dock-btn)' : 'var(--dock-soft)',
                    color: on ? 'var(--dock-btn-ink)' : 'var(--dock-ink)',
                    fontSize: 13,
                    fontWeight: on ? 700 : 600,
                    transition: 'background .2s',
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
              <p style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4, color: 'var(--rose-ink)' }}>{err}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 10, rowGap: 16 }}>
          <h2 className="display" style={{ gridColumn: '1 / -1', fontSize: 20, margin: '4px 4px 0' }}>
            En panne d’idée ?
          </h2>
          {IDEAS.map((idea, i) => {
            const pal = sipPalette(idea.text)
            return (
              <motion.button
                key={idea.label}
                initial={{ opacity: 0, y: 16, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.2 + i * 0.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => pick(idea.text)}
                style={{ position: 'relative', border: 'none', height: 124, borderRadius: 24, padding: 12, background: pal.bg, color: 'var(--ink)', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2 }}
              >
                <img src={topicArt(idea.text)} alt="" width={72} height={72} style={{ position: 'absolute', top: -10, right: -4 }} draggable={false} />
                <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.15 }}>{idea.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: pal.ink, lineHeight: 1.25 }}>{idea.hint}</span>
              </motion.button>
            )
          })}
        </section>
      </div>

      <div className="bottom-bar">
        {paywall && plan.data?.trial_available ? (
          <Button variant="peach" disabled={trial.isPending} onClick={() => trial.mutate()} sound="pop">
            {trial.isPending ? <Mascot mood="think" size={36} /> : `Essayer gratuitement ${plan.data.trial_days} jours`}
          </Button>
        ) : (
          <Button disabled={!ready || create.isPending} onClick={submit} sound="pop">
            {create.isPending ? (
              <>
                <Mascot mood="think" size={32} /> Je lis ta demande…
              </>
            ) : (
              'Construis mon parcours'
            )}
          </Button>
        )}
        {!guest && plan.data?.lite && !paywall && (
          <p className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 10 }}>
            Offre gratuite : un parcours court, préparé avec un modèle plus léger.
          </p>
        )}
      </div>
    </Screen>
  )
}
