import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { illustration } from '../components/SipIcon'
import { RevealLines } from '../components/motion'
import { Button, Icon } from '../components/ui'
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor'
import { Api, apiErrorMessage, type Plan, type PlanInfo } from '../lib/api'
import { MANAGE_SUBSCRIPTIONS_URL, isNative, openExternal } from '../lib/native'
import { play } from '../lib/sound'
import { buy, catalog, restore, storeAvailable } from '../lib/store'
import { track } from '../lib/telemetry'
import { t, locale } from '../lib/i18n'

const NAMES: Record<Plan['plan'], string> = t.plans.names
type Interval = 'month' | 'year'
type Paid = 'basic' | 'plus'

/** A price in minor units (cents) in the store's currency. */
const money = (cents: number, currency = 'EUR') =>
  (cents / 100).toLocaleString(locale, { style: 'currency', currency, minimumFractionDigits: cents % 100 ? 2 : 0 })

// Apple's standard licence unless our own terms are published; the privacy policy must be public.
const TERMS_URL = (import.meta.env.VITE_TERMS_URL as string | undefined) || 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
const PRIVACY_URL = import.meta.env.VITE_PRIVACY_URL as string | undefined

/** Days of the free introductory offer on this product, or 0 when it has none (or Apple would not give it). */
function trialDaysOf(pkg: PurchasesPackage | undefined, eligible: Set<string> | undefined) {
  const intro = pkg?.product.introPrice
  if (!pkg || !intro || intro.price !== 0 || !eligible?.has(pkg.product.identifier)) return 0
  const unit = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 }[intro.periodUnit] ?? 0
  return unit * intro.periodNumberOfUnits
}
const hours = (h: number) => `~${t.time.minutes(h < 1 ? Math.round(h * 60) : Math.round(h) * 60)}`

const TAGLINES: Partial<Record<Plan['plan'], string>> = t.offers.taglines

/** The three strongest reasons to pick a paid plan, shown on its card. */
const highlights = (p: PlanInfo) => [
  t.offers.highlights.sips(p.sips_per_month),
  t.offers.highlights.hours(hours(p.hours_per_month)),
  p.features?.audio ? t.offers.highlights.audio : t.offers.highlights.slots(p.slots),
]

/** Side by side comparison rows: label, then one cell per plan. */
const ROWS: [string, (p: PlanInfo) => string | boolean][] = [
  [t.offers.rows.sips, (p) => String(p.sips_per_month)],
  [t.offers.rows.hours, (p) => hours(p.hours_per_month).replace('~', '')],
  [t.offers.rows.slots, (p) => String(p.slots)],
  [t.offers.rows.full, (p) => !p.lite],
  [t.offers.rows.audio, (p) => !!p.features?.audio],
  [t.offers.rows.quiz, (p) => !!p.features?.quiz],
  [t.offers.rows.notes, (p) => (p.features?.notes ? String(p.features.notes) : '∞')],
  [t.offers.rows.help, (p) => String(p.features?.help_per_day ?? '')],
]

const linkStyle = { border: 'none', background: 'none', height: 36, fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', textDecoration: 'underline' } as const

const check = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5 9-10" />
  </svg>
)

/** The paywall: the recommended plan up front, a comparison table, then Apple's purchase sheet (free trial first when offered). */
export function Offers() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const plans = useQuery({ queryKey: ['plans'], queryFn: Api.plans, staleTime: 5 * 60_000 })
  const mine = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  const store = useQuery({ queryKey: ['store-catalog'], queryFn: catalog, enabled: storeAvailable, staleTime: 10 * 60_000, retry: 1 })
  const [interval, setPeriod] = useState<Interval>('year')
  const [chosen, setChosen] = useState<Paid>('basic')
  const [late, setLate] = useState(false)
  const done = (p: Plan) => {
    qc.setQueryData(['plan'], p)
    void qc.invalidateQueries({ queryKey: ['plans'] })
  }
  const subscribe = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      setLate(false)
      track('purchase_opened', { plan: chosen, interval })
      if (!(await buy(pkg))) return null
      track('subscribed', { plan: chosen, interval, trial: trialDaysOf(pkg, store.data?.introEligible) > 0 })
      try {
        return await Api.syncPurchases()
      } catch {
        // Paid at Apple: the webhook grants it in a moment even if this call failed.
        setLate(true)
        void qc.invalidateQueries({ queryKey: ['plan'] })
        return null
      }
    },
    onSuccess: (p) => {
      if (!p) return
      play('complete')
      done(p)
    },
  })
  const restoring = useMutation({
    mutationFn: async () => {
      await restore()
      return Api.syncPurchases()
    },
    onSuccess: (p) => {
      track('purchases_restored', { plan: p.plan })
      done(p)
    },
  })
  useEffect(() => track('offers_viewed'), [])
  const current = mine.data?.plan
  const subscribed = !!mine.data?.subscription
  const productOf = (p: PlanInfo | undefined, i: Interval) => p?.products?.[i]
  const pkgOf = (p: PlanInfo | undefined, i: Interval) => {
    const id = productOf(p, i)
    return id ? store.data?.packages[id] : undefined
  }
  const chosenInfo = plans.data?.find((p) => p.name === chosen)
  const chosenPkg = pkgOf(chosenInfo, interval)
  const selling = storeAvailable && (mine.data?.billing_enabled ?? false) && !subscribed && current !== 'max'
  const trialDays = mine.data?.trial_available ? trialDaysOf(chosenPkg, store.data?.introEligible) : 0
  const canTry = trialDays > 0

  const paid = (plans.data ?? []).filter((p) => p.name === 'basic' || p.name === 'plus')
  const table = (plans.data ?? []).filter((p) => p.name !== 'max')

  /** The App Store's price in the user's currency, else the reference price in euros. */
  const priceOf = (p: PlanInfo, i: Interval): { cents: number; currency: string } | null => {
    const pkg = pkgOf(p, i)
    if (pkg) return { cents: Math.round(pkg.product.price * 100), currency: pkg.product.currencyCode }
    if (storeAvailable && store.isSuccess) return null // not on sale in this storefront
    const cents = p.prices[i]
    return cents == null ? null : { cents, currency: 'EUR' }
  }
  /** Big price: what Apple will charge for the period (Apple requires it to be the most prominent). */
  const price = (p: PlanInfo) => priceOf(p, interval)
  const perDay = (p: PlanInfo) => {
    const v = priceOf(p, interval)
    return v == null ? null : { ...v, cents: Math.ceil(v.cents / (interval === 'month' ? 30 : 365)) }
  }
  const chosenPrice = chosenInfo ? priceOf(chosenInfo, interval) : null
  const chosenPriceText = chosenPkg?.product.priceString ?? (chosenPrice ? money(chosenPrice.cents, chosenPrice.currency) : null)
  const per = interval === 'month' ? t.offers.perMonth : t.offers.perYear

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
            aria-label={t.common.close}
            whileTap={{ scale: 0.9 }}
            onClick={() => nav(-1)}
            style={{ position: 'relative', width: 44, height: 44, borderRadius: 22, border: 'none', background: 'rgba(255,255,255,.22)', color: '#fff', display: 'grid', placeItems: 'center' }}
          >
            {Icon.close}
          </motion.button>
          <h1 className="display" style={{ position: 'relative', marginTop: 12, maxWidth: 210, fontSize: 40, lineHeight: 0.96, letterSpacing: '-0.05em' }}>
            <RevealLines lines={[{ text: t.offers.title[0] }, { text: t.offers.title[1] }, { text: t.offers.title[2], color: '#fff0c2' }]} delay={0.1} />
          </h1>
          <p style={{ position: 'relative', maxWidth: 200, fontSize: 15, lineHeight: 1.4, color: 'rgba(255,255,255,.86)' }}>
            {mine.data?.on_trial && mine.data.plan_expires_at
              ? t.offers.trialUntil(new Date(mine.data.plan_expires_at).toLocaleDateString(locale, { day: 'numeric', month: 'long' }))
              : t.offers.body}
          </p>
        </div>

        <div style={{ padding: '4px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!subscribed && current !== 'max' && (
            <div role="radiogroup" aria-label={t.offers.interval} style={{ alignSelf: 'center', display: 'flex', gap: 2, padding: 4, borderRadius: 24, background: 'var(--bg-deep)' }}>
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
                  <span style={{ position: 'relative' }}>{i === 'month' ? t.offers.monthly : t.offers.yearly}</span>
                  {i === 'year' && <span style={{ position: 'relative', height: 24, padding: '0 8px', borderRadius: 12, background: 'var(--mint-lip)', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center' }}>{t.offers.twoMonths}</span>}
                </button>
              ))}
            </div>
          )}

          {paid.map((p, i) => {
            const isMine = p.name === current
            const pickable = !subscribed && current !== 'max'
            const featured = pickable ? p.name === chosen : p.name === 'basic'
            const big = price(p)
            const day = perDay(p)
            const offered = mine.data?.trial_available ? trialDaysOf(pkgOf(p, interval), store.data?.introEligible) : 0
            const badge = p.name === 'basic' ? (offered ? t.offers.recommendedTrial(offered) : t.offers.recommended) : null
            return (
              <motion.section
                key={p.name}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                whileTap={pickable ? { scale: 0.98 } : undefined}
                transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.15 + i * 0.07 }}
                aria-label={t.plans.offers[p.name]}
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
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{isMine ? (mine.data?.on_trial ? t.offers.yourTrial : t.offers.yourPlan) : TAGLINES[p.name]}</span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                    <span className="display" style={{ fontSize: featured ? 34 : 24, lineHeight: 1 }}>{big == null ? t.offers.soon : money(big.cents, big.currency)}</span>
                    {big != null && (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {interval === 'year' ? `${t.offers.perYear}${t.offers.monthlyEquivalent(money(Math.floor(big.cents / 12), big.currency))}` : t.offers.perMonth}
                      </span>
                    )}
                  </span>
                </div>
                {featured && (
                  <>
                    {day != null && big != null && (
                      <span style={{ alignSelf: 'flex-start', height: 28, padding: '0 12px', borderRadius: 14, background: 'var(--butter)', color: 'var(--butter-ink)', display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700 }}>
                        {t.offers.perDay(money(day.cents, day.currency))}
                      </span>
                    )}
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {highlights(p).map((line) => (
                        <li key={line} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
                          <span style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--mint)', color: 'var(--mint-ink)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{check}</span>
                          {line}
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
              aria-label={t.offers.compare}
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
                          <span style={{ color: 'var(--mint-lip)', display: 'grid' }} aria-label={t.offers.yes}>{check}</span>
                        ) : v === false ? (
                          <span aria-label={t.offers.no} style={{ width: 12, height: 3, borderRadius: 2, background: 'var(--line-strong)' }} />
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

        </div>
      </div>

      <div className="bottom-bar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {subscribed ? (
          <Button onClick={() => openExternal(MANAGE_SUBSCRIPTIONS_URL)}>{t.offers.manage}</Button>
        ) : selling && chosenPkg ? (
          <>
            <Button disabled={subscribe.isPending || restoring.isPending} onClick={() => subscribe.mutate(chosenPkg)} sound="pop">
              {subscribe.isPending
                ? <Mascot mood="think" size={36} />
                : canTry ? t.offers.tryFree(trialDays) : t.offers.subscribe(NAMES[chosen], chosenPriceText ? `${chosenPriceText}${per}` : null)}
            </Button>
            {subscribe.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14, textAlign: 'center' }}>{apiErrorMessage(subscribe.error, t.offers.purchaseFailed)}</p>}
            {late && <p role="status" style={{ fontSize: 14, textAlign: 'center' }}>{t.offers.late}</p>}
            <p className="muted" style={{ fontSize: 11.5, textAlign: 'center', lineHeight: 1.4 }}>
              {canTry ? t.offers.trialTerms(trialDays, `${chosenPriceText}${per}`) : t.offers.renewal(`${chosenPriceText}${per}`)}
            </p>
          </>
        ) : selling && store.isPending ? (
          <Button disabled><Mascot mood="think" size={36} /></Button>
        ) : (
          <>
            <Button variant="soft" onClick={() => nav(-1)}>
              {t.common.back}
            </Button>
            {current !== 'max' && (
              <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
                {!isNative ? t.offers.appOnly : storeAvailable && store.isError ? apiErrorMessage(store.error, t.offers.storeDown) : t.offers.comingSoon}
              </p>
            )}
          </>
        )}
        {storeAvailable && !subscribed && current !== 'max' && (
          <>
            {restoring.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14, textAlign: 'center' }}>{apiErrorMessage(restoring.error, t.offers.restoreFailed)}</p>}
            {restoring.isSuccess && !restoring.data.subscription && <p role="status" style={{ fontSize: 14, textAlign: 'center' }}>{t.offers.nothingToRestore}</p>}
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0 14px' }}>
          {storeAvailable && !subscribed && current !== 'max' && (
            <button type="button" onClick={() => restoring.mutate()} disabled={restoring.isPending || subscribe.isPending} style={linkStyle}>
              {restoring.isPending ? t.offers.restoring : t.offers.restore}
            </button>
          )}
          <button type="button" onClick={() => openExternal(TERMS_URL)} style={linkStyle}>{t.offers.terms}</button>
          {PRIVACY_URL && <button type="button" onClick={() => openExternal(PRIVACY_URL)} style={linkStyle}>{t.offers.privacy}</button>}
        </div>
      </div>
    </Screen>
  )
}
