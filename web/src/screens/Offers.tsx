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

const perks = (p: PlanInfo) => [
  `${hours(p.hours_per_month)} de cours par mois`,
  p.slots === 1 ? '1 Sip à la fois' : `${p.slots} Sips en même temps`,
  p.sips_per_month === 1 ? '1 nouveau Sip par mois' : `${p.sips_per_month} nouveaux Sips par mois`,
  p.lite ? 'Parcours courts' : 'Parcours complets, sur mesure',
  ...(p.features?.audio ? ['Leçons lues à voix haute'] : []),
  ...(p.features?.quiz ? ['Quiz de fin de module'] : []),
  ...(p.features ? [p.features.notes ? `${p.features.notes} passages dans ton carnet` : 'Carnet de notes illimité'] : []),
  ...(p.features ? [`${p.features.help_per_day} réexplications par jour`] : []),
]

const PERK_TONES = [
  ['var(--peach-soft)', 'var(--peach-ink)'],
  ['var(--lavender)', 'var(--lavender-ink)'],
  ['var(--mint)', 'var(--mint-ink)'],
  ['var(--butter)', 'var(--butter-ink)'],
  ['var(--sky)', 'var(--sky-ink)'],
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

  const priceLabel = (p: PlanInfo) => {
    if (p.name === 'free') return '0 €'
    const cents = p.prices[interval]
    if (!mine.data?.billing_enabled || cents == null) return 'Bientôt'
    return interval === 'month' ? `${euros(cents)}/mois` : `${euros(cents)}/an`
  }

  return (
    <Screen kind="modal">
      <div className="scroll" style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }}>
        <div style={{ position: 'relative', overflow: 'hidden', flexShrink: 0, background: 'var(--dock)', color: 'var(--dock-ink)', borderRadius: '0 0 40px 40px', padding: 'calc(var(--safe-top) + 14px) 20px 26px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <motion.span
            aria-hidden="true"
            initial={{ scale: 0.3 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 110, damping: 15 }}
            style={{ position: 'absolute', right: -60, top: 'calc(var(--safe-top) + 20px)', width: 240, height: 240, borderRadius: 120, background: 'var(--primary)' }}
          />
          <motion.img
            src={illustration('scene-premium')}
            alt=""
            width={164}
            height={164}
            initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 13, delay: 0.15 }}
            style={{ position: 'absolute', right: -4, top: 'calc(var(--safe-top) + 56px)' }}
          />
          <motion.button
            aria-label="Fermer"
            whileTap={{ scale: 0.9 }}
            onClick={() => nav(-1)}
            style={{ position: 'relative', width: 44, height: 44, borderRadius: 22, border: 'none', background: 'rgba(255,255,255,.12)', color: 'var(--dock-ink)', display: 'grid', placeItems: 'center' }}
          >
            {Icon.close}
          </motion.button>
          <h1 className="display" style={{ position: 'relative', marginTop: 12, maxWidth: 210, fontSize: 40, lineHeight: 0.96, letterSpacing: '-0.05em' }}>
            <RevealLines lines={[{ text: 'Apprends' }, { text: 'sans' }, { text: 'compter.', color: 'var(--sun)' }]} delay={0.1} />
          </h1>
          <p style={{ position: 'relative', maxWidth: 200, fontSize: 15, lineHeight: 1.4, color: 'var(--dock-muted)' }}>
            {mine.data?.on_trial && mine.data.plan_expires_at
              ? `Ton essai court jusqu’au ${new Date(mine.data.plan_expires_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`
              : 'Parcours complets, quiz, écoute. Change ou arrête quand tu veux.'}
          </p>
          {selling && (
            <div role="radiogroup" aria-label="Fréquence de paiement" style={{ position: 'relative', alignSelf: 'flex-start', display: 'flex', gap: 2, padding: 4, borderRadius: 24, background: 'rgba(255,255,255,.1)', marginTop: 4 }}>
              {(['month', 'year'] as const).map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={interval === i}
                  onClick={() => setPeriod(i)}
                  style={{
                    position: 'relative', border: 'none', borderRadius: 20, minHeight: 40, padding: '0 14px', fontSize: 14, fontWeight: 700,
                    background: 'transparent', color: interval === i ? '#1d1a17' : 'var(--dock-muted)', display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {interval === i && <motion.span layoutId="interval-pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} style={{ position: 'absolute', inset: 0, borderRadius: 20, background: '#fff' }} />}
                  <span style={{ position: 'relative' }}>{i === 'month' ? 'Mensuel' : 'Annuel'}</span>
                  {i === 'year' && <span style={{ position: 'relative', height: 22, padding: '0 8px', borderRadius: 11, background: 'var(--mint-lip)', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center' }}>2 mois offerts</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '6px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {(plans.data ?? []).map((p, i) => {
          const isMine = p.name === current
          const pickable = selling && p.name !== 'free'
          const highlight = pickable ? p.name === chosen : canTry ? p.name === 'basic' : isMine
          const yearly = p.prices.year
          return (
            <motion.section
              key={p.name}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileTap={pickable ? { scale: 0.98 } : undefined}
              transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.15 + i * 0.07 }}
              aria-label={`Offre ${NAMES[p.name]}`}
              role={pickable ? 'radio' : undefined}
              aria-checked={pickable ? p.name === chosen : undefined}
              tabIndex={pickable ? 0 : undefined}
              onClick={pickable ? () => setChosen(p.name as Paid) : undefined}
              onKeyDown={pickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChosen(p.name as Paid) } } : undefined}
              style={{
                position: 'relative',
                borderRadius: 26,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                cursor: pickable ? 'pointer' : undefined,
                background: 'var(--surface)',
                boxShadow: highlight ? 'inset 0 0 0 3px var(--primary)' : 'none',
                marginTop: p.name === 'basic' && canTry ? 8 : 0,
                transition: 'box-shadow .2s',
              }}
            >
              {p.name === 'basic' && canTry && (
                <span className="kicker" style={{ position: 'absolute', top: -11, left: 16, height: 22, padding: '0 10px', borderRadius: 11, background: 'var(--primary)', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center' }}>
                  {mine.data?.trial_days} jours offerts
                </span>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span className="display" style={{ fontSize: 24 }}>{NAMES[p.name]}</span>
                <span className="display" style={{ fontSize: 18, color: isMine ? 'var(--primary)' : 'var(--ink)' }}>
                  {isMine ? (mine.data?.on_trial ? 'Ton essai' : 'Ton offre') : priceLabel(p)}
                </span>
              </div>
              {selling && interval === 'year' && yearly != null && (
                <span className="muted" style={{ fontSize: 13, marginTop: -6 }}>soit {euros(Math.round(yearly / 12))}/mois</span>
              )}
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {perks(p).map((t, j) => (
                  <li key={t} style={{ padding: '6px 10px', borderRadius: 14, fontSize: 13, fontWeight: 600, lineHeight: 1.3, background: PERK_TONES[j % PERK_TONES.length][0], color: PERK_TONES[j % PERK_TONES.length][1] }}>
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
