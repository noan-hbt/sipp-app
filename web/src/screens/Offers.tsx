import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { illustration } from '../components/SipIcon'
import { RevealLines } from '../components/motion'
import { Button, Icon } from '../components/ui'
import { Api, apiErrorMessage, type Plan, type PlanInfo } from '../lib/api'
import { openCheckout } from '../lib/paddle'
import { play } from '../lib/sound'
import { track } from '../lib/telemetry'

const NAMES: Record<Plan['plan'], string> = { free: 'Gratuit', basic: 'Essentiel', plus: 'Plus', max: 'Équipe' }
type Interval = 'month' | 'year'
type Paid = 'basic' | 'plus'

const euros = (cents: number) =>
  (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 })
const hours = (h: number) => (h < 1 ? `~${Math.round(h * 60)} min` : `~${Math.round(h)} h`)

const TAGLINES: Partial<Record<Plan['plan'], string>> = {
  basic: 'Pour apprendre un peu chaque jour',
  plus: 'Pour les curieux insatiables',
}

/** The three strongest reasons to pick a paid plan, shown on its card. */
const highlights = (p: PlanInfo) => [
  `${p.sips_per_month} nouveaux Sips complets par mois`,
  `${hours(p.hours_per_month)} de cours par mois`,
  p.features?.audio ? 'Leçons lues à voix haute, quiz de module' : `${p.slots} Sips en même temps`,
]

/** Side by side comparison rows: label, then one cell per plan. */
const ROWS: [string, (p: PlanInfo) => string | boolean][] = [
  ['Nouveaux Sips / mois', (p) => String(p.sips_per_month)],
  ['Cours par mois', (p) => hours(p.hours_per_month).replace('~', '')],
  ['Sips en même temps', (p) => String(p.slots)],
  ['Parcours complets', (p) => !p.lite],
  ['Écoute audio', (p) => !!p.features?.audio],
  ['Quiz de module', (p) => !!p.features?.quiz],
  ['Carnet de notes', (p) => (p.features?.notes ? String(p.features.notes) : '∞')],
  ['Réexplications / jour', (p) => String(p.features?.help_per_day ?? '')],
]

const check = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5 9-10" />
  </svg>
)

/** The paywall: the recommended plan up front, a comparison table, then a free trial or a Paddle checkout. */
export function Offers() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const plans = useQuery({ queryKey: ['plans'], queryFn: Api.plans, staleTime: 5 * 60_000 })
  const mine = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  const me = useQuery({ queryKey: ['me'], queryFn: Api.me })
  const [interval, setPeriod] = useState<Interval>('year')
  const [chosen, setChosen] = useState<Paid>('basic')
  const [consent, setConsent] = useState(false)
  // With a free trial on offer, paying right away is the secondary path.
  const [direct, setDirect] = useState(false)
  const trial = useMutation({
    mutationFn: Api.startTrial,
    onSuccess: (p) => {
      track('trial_started', { from: 'offers' })
      play('complete')
      qc.setQueryData(['plan'], p)
    },
  })
  const subscribe = useMutation({
    mutationFn: async () => {
      const c = await Api.checkout(chosen, interval)
      track('checkout_opened', { plan: chosen, interval })
      await openCheckout({
        transactionId: c.transaction_id,
        clientToken: c.client_token,
        environment: c.environment,
        successUrl: c.success_url,
        email: me.data?.email,
      })
    },
  })
  const portal = useMutation({
    mutationFn: Api.billingPortal,
    onSuccess: ({ url }) => window.location.assign(url),
  })
  useEffect(() => track('offers_viewed'), [])
  const current = mine.data?.plan
  const canTry = mine.data?.trial_available ?? false
  const selling = (mine.data?.billing_enabled ?? false) && !mine.data?.subscription && current !== 'max'
  const subscribed = !!mine.data?.subscription
  const chosenPrice = plans.data?.find((p) => p.name === chosen)?.prices[interval]

  const paid = (plans.data ?? []).filter((p) => p.name === 'basic' || p.name === 'plus')
  const table = (plans.data ?? []).filter((p) => p.name !== 'max')
  const trialDays = mine.data?.trial_days ?? 7

  /** Big price: monthly, or the yearly price brought back to a month. */
  const price = (p: PlanInfo) => {
    const cents = p.prices[interval]
    if (!mine.data?.billing_enabled || cents == null) return null
    return interval === 'month' ? cents : Math.round(cents / 12)
  }
  const perDay = (p: PlanInfo) => {
    const cents = p.prices[interval]
    return cents == null ? null : Math.ceil(cents / (interval === 'month' ? 30 : 365))
  }

  return (
    <Screen kind="modal">
      <div className="scroll" style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }}>
        {/* Same caramel in light and dark, like the welcome band. */}
        <div style={{ position: 'relative', overflow: 'hidden', flexShrink: 0, background: '#d9622b', color: '#fff', borderRadius: '0 0 40px 40px', padding: 'calc(var(--safe-top) + 14px) 20px 26px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <motion.span
            aria-hidden="true"
            initial={{ scale: 0.3 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 110, damping: 15 }}
            style={{ position: 'absolute', right: -70, top: 'calc(var(--safe-top) + 30px)', width: 250, height: 250, borderRadius: 125, background: '#e5763f' }}
          />
          <motion.img
            src={illustration('scene-premium')}
            alt=""
            width={168}
            height={168}
            initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 13, delay: 0.15 }}
            style={{ position: 'absolute', right: -4, top: 'calc(var(--safe-top) + 64px)' }}
          />
          <motion.button
            aria-label="Fermer"
            whileTap={{ scale: 0.9 }}
            onClick={() => nav(-1)}
            style={{ position: 'relative', width: 44, height: 44, borderRadius: 22, border: 'none', background: 'rgba(255,255,255,.22)', color: '#fff', display: 'grid', placeItems: 'center' }}
          >
            {Icon.close}
          </motion.button>
          <h1 className="display" style={{ position: 'relative', marginTop: 12, maxWidth: 210, fontSize: 40, lineHeight: 0.96, letterSpacing: '-0.05em' }}>
            <RevealLines lines={[{ text: 'Apprends' }, { text: 'sans' }, { text: 'compter.', color: '#fff0c2' }]} delay={0.1} />
          </h1>
          <p style={{ position: 'relative', maxWidth: 200, fontSize: 15, lineHeight: 1.4, color: 'rgba(255,255,255,.86)' }}>
            {mine.data?.on_trial && mine.data.plan_expires_at
              ? `Ton essai court jusqu’au ${new Date(mine.data.plan_expires_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`
              : 'Des parcours complets sur tout ce qui t’intrigue, 5 minutes à la fois.'}
          </p>
        </div>

        <div style={{ padding: '4px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {selling && (
            <div role="radiogroup" aria-label="Fréquence de paiement" style={{ alignSelf: 'center', display: 'flex', gap: 2, padding: 4, borderRadius: 24, background: 'var(--bg-deep)' }}>
              {(['month', 'year'] as const).map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={interval === i}
                  onClick={() => setPeriod(i)}
                  style={{ position: 'relative', border: 'none', borderRadius: 20, minHeight: 40, padding: i === 'year' ? '0 8px 0 16px' : '0 16px', fontSize: 14, fontWeight: 700, background: 'transparent', color: interval === i ? 'var(--ink)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  {interval === i && <motion.span layoutId="interval-pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} style={{ position: 'absolute', inset: 0, borderRadius: 20, background: 'var(--surface)' }} />}
                  <span style={{ position: 'relative' }}>{i === 'month' ? 'Mensuel' : 'Annuel'}</span>
                  {i === 'year' && <span style={{ position: 'relative', height: 24, padding: '0 8px', borderRadius: 12, background: 'var(--mint-lip)', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center' }}>2 mois offerts</span>}
                </button>
              ))}
            </div>
          )}

          {paid.map((p, i) => {
            const isMine = p.name === current
            const pickable = selling
            const featured = pickable ? p.name === chosen : p.name === 'basic'
            const big = price(p)
            const yearly = p.prices.year
            const day = perDay(p)
            const badge = p.name === 'basic' ? (canTry ? `Recommandé · ${trialDays} jours offerts` : 'Recommandé') : null
            return (
              <motion.section
                key={p.name}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                whileTap={pickable ? { scale: 0.98 } : undefined}
                transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.15 + i * 0.07 }}
                aria-label={`Offre ${NAMES[p.name]}`}
                role={pickable ? 'radio' : undefined}
                aria-checked={pickable ? p.name === chosen : undefined}
                tabIndex={pickable ? 0 : undefined}
                onClick={pickable ? () => setChosen(p.name as Paid) : undefined}
                onKeyDown={pickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChosen(p.name as Paid) } } : undefined}
                style={{
                  position: 'relative',
                  borderRadius: 28,
                  padding: featured ? '20px 18px 18px' : 18,
                  marginTop: badge ? 8 : 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  cursor: pickable ? 'pointer' : undefined,
                  background: 'var(--surface)',
                  boxShadow: featured ? 'inset 0 0 0 3px var(--primary), 0 14px 30px rgba(217,98,43,.14)' : 'none',
                  transition: 'box-shadow .2s',
                }}
              >
                {badge && (
                  <span className="kicker" style={{ position: 'absolute', top: -12, left: 18, height: 24, padding: '0 12px', borderRadius: 12, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center' }}>
                    {badge}
                  </span>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span className="display" style={{ fontSize: featured ? 26 : 22 }}>{NAMES[p.name]}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{isMine ? (mine.data?.on_trial ? 'Ton essai en cours' : 'Ton offre actuelle') : TAGLINES[p.name]}</span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                    <span className="display" style={{ fontSize: featured ? 34 : 24, lineHeight: 1 }}>{big == null ? 'Bientôt' : euros(big)}</span>
                    {big != null && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        /mois{interval === 'year' && yearly != null ? ` · ${euros(yearly)} par an` : ''}
                      </span>
                    )}
                  </span>
                </div>
                {featured && (
                  <>
                    {day != null && big != null && (
                      <span style={{ alignSelf: 'flex-start', height: 28, padding: '0 12px', borderRadius: 14, background: 'var(--butter)', color: 'var(--butter-ink)', display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
                        Moins de {euros(day)} par jour
                      </span>
                    )}
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {highlights(p).map((t) => (
                        <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
                          <span style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--mint)', color: 'var(--mint-ink)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{check}</span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </motion.section>
            )
          })}

          {table.length > 1 && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              aria-label="Comparer les offres"
              style={{ borderRadius: 24, background: 'var(--surface)', padding: '12px 16px 6px' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: `1.5fr repeat(${table.length}, 1fr)`, alignItems: 'end', paddingBottom: 8 }}>
                <span />
                {table.map((p) => (
                  <span key={p.name} className="kicker" style={{ textAlign: 'center', color: p.name === chosen ? 'var(--primary)' : 'var(--faint)' }}>{NAMES[p.name]}</span>
                ))}
              </div>
              {ROWS.map(([label, value]) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: `1.5fr repeat(${table.length}, 1fr)`, alignItems: 'center', minHeight: 36, borderTop: '1px solid var(--line)' }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.2 }}>{label}</span>
                  {table.map((p) => {
                    const v = value(p)
                    const on = p.name === chosen
                    return (
                      <span key={p.name} style={{ display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: on ? 'var(--primary)' : 'var(--ink)' }}>
                        {v === true ? (
                          <span style={{ color: 'var(--mint-lip)', display: 'grid' }} aria-label="oui">{check}</span>
                        ) : v === false ? (
                          <span aria-label="non" style={{ width: 12, height: 3, borderRadius: 2, background: 'var(--line-strong)' }} />
                        ) : (
                          v
                        )}
                      </span>
                    )
                  })}
                </div>
              ))}
            </motion.section>
          )}

          {trial.isError && (
            <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14 }}>
              Ton essai n’a pas pu démarrer. Réessaie dans un instant.
            </p>
          )}
        </div>
      </div>

      <div className="bottom-bar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {subscribed ? (
          <>
            <Button disabled={portal.isPending} onClick={() => portal.mutate()}>
              {portal.isPending ? <Mascot mood="think" size={36} /> : 'Gérer mon abonnement'}
            </Button>
            {portal.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14, textAlign: 'center' }}>{apiErrorMessage(portal.error)}</p>}
          </>
        ) : selling && (!canTry || direct) ? (
          <>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.4, color: 'var(--ink-soft)' }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: 'var(--primary)' }}
              />
              <span>
                Je veux accéder tout de suite à mon abonnement et j’accepte qu’il commence avant la fin du délai de rétractation de 14 jours.
              </span>
            </label>
            <Button disabled={!consent || subscribe.isPending || chosenPrice == null} onClick={() => subscribe.mutate()} sound="pop">
              {subscribe.isPending
                ? <Mascot mood="think" size={36} />
                : `S’abonner à ${NAMES[chosen]}${chosenPrice != null ? ` · ${euros(chosenPrice)}${interval === 'month' ? '/mois' : '/an'}` : ''}`}
            </Button>
            {subscribe.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14, textAlign: 'center' }}>{apiErrorMessage(subscribe.error)}</p>}
            {canTry && (
              <button type="button" onClick={() => setDirect(false)} style={{ border: 'none', background: 'none', height: 40, fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>
                Plutôt essayer {trialDays} jours gratuitement
              </button>
            )}
            <p className="muted" style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.4 }}>
              Paiement sécurisé par Paddle, notre revendeur. Résiliable à tout moment depuis ton profil.
            </p>
          </>
        ) : canTry ? (
          <>
            <Button disabled={trial.isPending} onClick={() => trial.mutate()} sound="pop">
              {trial.isPending ? <Mascot mood="think" size={36} /> : `Essayer ${trialDays} jours gratuitement`}
            </Button>
            <p className="muted" style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.4 }}>
              Essentiel, sans carte bancaire. Tu repasses en Gratuit à la fin, sans rien payer.
            </p>
            {selling && (
              <button type="button" onClick={() => setDirect(true)} style={{ border: 'none', background: 'none', height: 40, fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>
                S’abonner directement à {NAMES[chosen]}
              </button>
            )}
          </>
        ) : (
          <>
            <Button variant="soft" onClick={() => nav(-1)}>
              Retour
            </Button>
            {!mine.data?.billing_enabled && (
              <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
                Les abonnements arrivent bientôt.
              </p>
            )}
          </>
        )}
      </div>
    </Screen>
  )
}
