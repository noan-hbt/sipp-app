import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { illustration } from '../components/SipIcon'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, apiErrorMessage, type Plan, type PlanInfo } from '../lib/api'
import { openCheckout } from '../lib/paddle'
import { play } from '../lib/sound'

const NAMES: Record<Plan['plan'], string> = { free: 'Gratuit', basic: 'Essentiel', plus: 'Plus', max: 'Équipe' }
type Interval = 'month' | 'year'
type Paid = 'basic' | 'plus'

const euros = (cents: number) =>
  (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 })
const hours = (h: number) => (h < 1 ? `~${Math.round(h * 60)} min` : `~${Math.round(h)} h`)

const perks = (p: PlanInfo) => [
  `${hours(p.hours_per_month)} de cours par mois`,
  p.slots === 1 ? '1 Sip à la fois' : `${p.slots} Sips en même temps`,
  p.sips_per_month === 1 ? '1 nouveau Sip par mois' : `${p.sips_per_month} nouveaux Sips par mois`,
  p.lite ? 'Parcours courts' : 'Parcours complets, sur mesure',
]

/** The plans side by side: subscribe through Paddle, or try the paid plan once for free. */
export function Offers() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const plans = useQuery({ queryKey: ['plans'], queryFn: Api.plans, staleTime: 5 * 60_000 })
  const mine = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  const me = useQuery({ queryKey: ['me'], queryFn: Api.me })
  const [interval, setPeriod] = useState<Interval>('month')
  const [chosen, setChosen] = useState<Paid>('basic')
  const [consent, setConsent] = useState(false)
  const trial = useMutation({
    mutationFn: Api.startTrial,
    onSuccess: (p) => {
      play('complete')
      qc.setQueryData(['plan'], p)
    },
  })
  const subscribe = useMutation({
    mutationFn: async () => {
      const c = await Api.checkout(chosen, interval)
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
  const current = mine.data?.plan
  const canTry = mine.data?.trial_available ?? false
  const selling = (mine.data?.billing_enabled ?? false) && !mine.data?.subscription && current !== 'max'
  const subscribed = !!mine.data?.subscription
  const chosenPrice = plans.data?.find((p) => p.name === chosen)?.prices[interval]

  const priceLabel = (p: PlanInfo) => {
    if (p.name === 'free') return '0 €'
    const cents = p.prices[interval]
    if (!mine.data?.billing_enabled || cents == null) return 'Bientôt'
    return interval === 'month' ? `${euros(cents)}/mois` : `${euros(cents)}/an`
  }

  return (
    <Screen kind="modal">
      <header className="topbar">
        <IconButton label="Fermer" onClick={() => nav(-1)}>
          {Icon.close}
        </IconButton>
      </header>

      <div className="scroll" style={{ padding: '0 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={illustration('scene-celebrate')} alt="" width={104} height={104} style={{ flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 className="title-l">Apprends tout ce qui te fait envie</h1>
            <p className="muted" style={{ fontSize: 15 }}>
              {mine.data?.on_trial && mine.data.plan_expires_at
                ? `Ton essai court jusqu’au ${new Date(mine.data.plan_expires_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`
                : 'Change ou arrête quand tu veux.'}
            </p>
          </div>
        </div>

        {selling && (
          <div role="radiogroup" aria-label="Fréquence de paiement" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4, borderRadius: 16, background: 'var(--bg-deep)' }}>
            {(['month', 'year'] as const).map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={interval === i}
                onClick={() => setPeriod(i)}
                style={{
                  border: 'none', borderRadius: 12, minHeight: 44, fontSize: 15, fontWeight: 600,
                  background: interval === i ? 'var(--surface)' : 'transparent',
                  color: interval === i ? 'var(--ink)' : 'var(--muted)',
                }}
              >
                {i === 'month' ? 'Mensuel' : 'Annuel · 2 mois offerts'}
              </button>
            ))}
          </div>
        )}

        {(plans.data ?? []).map((p, i) => {
          const isMine = p.name === current
          const pickable = selling && p.name !== 'free'
          const highlight = pickable ? p.name === chosen : canTry ? p.name === 'basic' : isMine
          const yearly = p.prices.year
          return (
            <motion.section
              key={p.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.06 }}
              aria-label={`Offre ${NAMES[p.name]}`}
              role={pickable ? 'radio' : undefined}
              aria-checked={pickable ? p.name === chosen : undefined}
              tabIndex={pickable ? 0 : undefined}
              onClick={pickable ? () => setChosen(p.name as Paid) : undefined}
              onKeyDown={pickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChosen(p.name as Paid) } } : undefined}
              style={{
                position: 'relative',
                borderRadius: 22,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                cursor: pickable ? 'pointer' : undefined,
                background: highlight ? 'var(--primary-soft)' : 'var(--surface)',
                boxShadow: highlight ? 'inset 0 0 0 2.5px var(--primary)' : 'inset 0 0 0 2px var(--line)',
                marginTop: highlight && canTry ? 6 : 0,
              }}
            >
              {p.name === 'basic' && canTry && (
                <span style={{ position: 'absolute', top: -11, right: 16, padding: '4px 10px', borderRadius: 10, background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                  {mine.data?.trial_days} jours offerts
                </span>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{NAMES[p.name]}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: isMine ? 'var(--primary-ink)' : 'var(--muted)' }}>
                  {isMine ? (mine.data?.on_trial ? 'Ton essai' : 'Ton offre') : priceLabel(p)}
                </span>
              </div>
              {selling && interval === 'year' && yearly != null && (
                <span className="muted" style={{ fontSize: 13, marginTop: -6 }}>soit {euros(Math.round(yearly / 12))}/mois</span>
              )}
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {perks(p).map((t) => (
                  <li key={t} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 15, lineHeight: 1.35, color: 'var(--ink-soft)' }}>
                    {Icon.check(15, highlight ? 'var(--primary-ink)' : 'var(--mint-ink)')}
                    {t}
                  </li>
                ))}
              </ul>
            </motion.section>
          )
        })}
        {trial.isError && (
          <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14 }}>
            Ton essai n’a pas pu démarrer. Réessaie dans un instant.
          </p>
        )}
      </div>

      <div className="bottom-bar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {subscribed ? (
          <>
            <Button disabled={portal.isPending} onClick={() => portal.mutate()}>
              {portal.isPending ? <Mascot mood="think" size={36} /> : 'Gérer mon abonnement'}
            </Button>
            {portal.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14, textAlign: 'center' }}>{apiErrorMessage(portal.error)}</p>}
          </>
        ) : selling ? (
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
              <Button variant="soft" disabled={trial.isPending} onClick={() => trial.mutate()}>
                {trial.isPending ? <Mascot mood="think" size={36} /> : `Essayer Essentiel ${mine.data?.trial_days} jours, sans carte`}
              </Button>
            )}
            <p className="muted" style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.4 }}>
              Paiement sécurisé par Paddle, notre revendeur. Résiliable à tout moment depuis ton profil.
            </p>
          </>
        ) : canTry ? (
          <>
            <Button disabled={trial.isPending} onClick={() => trial.mutate()} sound="pop">
              {trial.isPending ? <Mascot mood="think" size={36} /> : `Essayer Essentiel ${mine.data?.trial_days} jours`}
            </Button>
            <p className="muted" style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.4 }}>
              Gratuit, sans carte. Tu repasses en Gratuit à la fin de l’essai.
            </p>
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
