import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { HabitSettings } from '../components/HabitSettings'
import { Mascot } from '../components/Mascot'
import { illustration } from '../components/SipIcon'
import { CountUp } from '../components/motion'
import { Screen } from '../components/Screen'
import { Button, Icon, Star } from '../components/ui'
import { Api, ApiError, apiErrorMessage, setTokens, type Plan } from '../lib/api'
import { setSoundEnabled, soundEnabled } from '../lib/sound'
import { track } from '../lib/telemetry'
import { t, locale, plural } from '../lib/i18n'

const list = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }
const item = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 22 } },
}
const planNames: Record<Plan['plan'], string> = t.plans.names
const rowStyle: CSSProperties = {
  border: 'none', background: 'transparent', padding: '16px', display: 'flex', alignItems: 'center',
  minHeight: 56, width: '100%', textAlign: 'left', fontSize: 16, fontWeight: 500, gap: 12,
}
const rowIcon = (bg: string, fg: string, d: string) => (
  <span style={{ width: 36, height: 36, borderRadius: 18, background: bg, color: fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  </span>
)

export function Profile() {
  const nav = useNavigate()
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: Api.me })
  const stats = useQuery({ queryKey: ['stats'], queryFn: Api.stats })
  const plan = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  const [sound, setSound] = useState(soundEnabled)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [password, setPassword] = useState('')

  const trial = useMutation({
    mutationFn: Api.startTrial,
    onSuccess: () => {
      track('trial_started', { from: 'profile' })
      return queryClient.invalidateQueries({ queryKey: ['plan'] })
    },
  })
  const portal = useMutation({
    mutationFn: async (to: 'manage' | 'cancel') => {
      const urls = await Api.billingPortal()
      window.location.assign(to === 'cancel' ? urls.cancel_url ?? urls.url : urls.url)
    },
  })
  const exportData = useMutation({
    mutationFn: async () => {
      const data = await Api.exportData()
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'sipp-export.json'
      document.body.appendChild(link)
      try {
        link.click()
      } finally {
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    },
  })
  const logout = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      await Api.logout().catch(() => undefined)
    },
  })
  const deleteAccount = useMutation({
    mutationFn: Api.deleteAccount,
    onSuccess: () => {
      queryClient.clear()
      setTokens(null)
    },
  })
  const busy = logout.isPending || deleteAccount.isPending
  const subscription = plan.data
  const slotsProgress = subscription ? Math.min(1, Math.max(0, subscription.slots_used / Math.max(1, subscription.slots))) : 0

  return (
    <Screen kind="fade">
      <div className="scroll" style={{ padding: 'calc(var(--safe-top) + 16px) 16px 130px' }}>
        <motion.div variants={list} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <motion.section variants={item} aria-label="Tes statistiques" style={{ position: 'relative', borderRadius: 32, padding: '20px 16px 16px', background: 'var(--peach-soft)', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <motion.span
              aria-hidden="true"
              initial={{ scale: 0.3 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 120, damping: 16 }}
              style={{ position: 'absolute', right: -36, top: -46, width: 170, height: 170, borderRadius: 85, background: 'var(--surface)', opacity: 0.55 }}
            />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 className="display" style={{ fontSize: 40, lineHeight: 1, letterSpacing: '-0.05em' }}>{t.tabs.me}</h1>
                <p style={{ fontSize: 14, marginTop: 4, color: 'var(--peach-ink)', fontWeight: 500, overflowWrap: 'anywhere' }}>
                  {me.data?.email ?? (me.isError ? t.profile.emailUnavailable : t.profile.loading)}
                </p>
              </div>
              <motion.span
                initial={{ scale: 0.5, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 14 }}
                style={{ flexShrink: 0, display: 'grid' }}
              >
                <Mascot size={84} />
              </motion.span>
            </div>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {[
                { label: plural(stats.data?.streak_days ?? 0, t.profile.streakDay, t.profile.streakDays), value: stats.data?.streak_days, icon: Icon.flame, ink: 'var(--butter-ink)' },
                { label: plural(stats.data?.lessons_completed ?? 0, t.share.lesson, t.share.lessons), value: stats.data?.lessons_completed, icon: Icon.check(18, 'var(--peach-ink)'), ink: 'var(--peach-ink)' },
                { label: plural(stats.data?.total_stars ?? 0, t.share.star, t.share.stars), value: stats.data?.total_stars, icon: <Star size={18} />, ink: 'var(--lavender-ink)' },
              ].map(({ label, value, icon, ink }, i) => (
                <div key={i} style={{ borderRadius: 22, padding: 12, display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--surface)' }}>
                  <span aria-hidden="true" style={{ display: 'grid' }}>{icon}</span>
                  <span className="hero-num" style={{ fontSize: 30, paddingTop: 2 }}>{value === undefined ? '—' : <CountUp value={value} delay={0.2 + i * 0.1} />}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: ink }}>{label}</span>
                </div>
              ))}
            </div>
            {stats.isError && <p role="status" style={{ position: 'relative', fontSize: 13, color: 'var(--peach-ink)' }}>{t.profile.statsUnavailable}</p>}
            <button type="button" onClick={() => nav('/progress')} style={{ position: 'relative', border: 'none', borderRadius: 24, height: 48, background: 'var(--primary)', color: '#fff', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
              {t.profile.seeProgress}
            </button>
          </motion.section>

          <motion.section variants={item} aria-label={t.profile.subscription} style={{ borderRadius: 30, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--plan-bg)', color: 'var(--plan-ink)', boxShadow: 'inset 0 0 0 1px var(--plan-line)', position: 'relative', overflow: 'hidden' }}>
            <motion.span
              aria-hidden="true"
              initial={{ scale: 0.3 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.2 }}
              style={{ position: 'absolute', right: -40, top: -40, width: 132, height: 132, borderRadius: 66, background: 'var(--plan-accent)' }}
            />
            <img src={illustration('scene-premium')} alt="" width={84} height={84} style={{ position: 'absolute', right: 0, top: 0 }} />
            {subscription ? (
              <>
                <div style={{ position: 'relative', paddingRight: 92 }}>
                  <span className="kicker" style={{ color: 'var(--plan-kicker)' }}>
                    {subscription.on_trial ? t.profile.trialOf(planNames[subscription.plan]) : t.plans.offers[subscription.plan]}
                  </span>
                  <h2 className="title-m" style={{ marginTop: 6 }}>{subscription.on_trial ? t.profile.trialRunning : planNames[subscription.plan]}</h2>
                  {subscription.on_trial && subscription.plan_expires_at && (
                    <p style={{ fontSize: 14, marginTop: 2, color: 'var(--plan-muted)' }}>
                      {t.profile.trialUntil(new Date(subscription.plan_expires_at).toLocaleDateString(locale, { day: 'numeric', month: 'long' }))}
                    </p>
                  )}
                </div>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--plan-muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t.tabs.library}</span>
                    <span>{t.profile.slots(subscription.slots_used, subscription.slots)}</span>
                  </p>
                  <div
                    role="progressbar"
                    aria-label={t.profile.slotsLabel}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(slotsProgress * 100)}
                    aria-valuetext={t.profile.slots(subscription.slots_used, subscription.slots)}
                    style={{ height: 8, borderRadius: 4, background: 'var(--plan-track)', overflow: 'hidden' }}
                  >
                    <motion.div className="liquid" initial={{ width: 0 }} animate={{ width: `${slotsProgress * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} style={{ height: '100%', borderRadius: 4, background: 'var(--plan-bar)' }} />
                  </div>
                </div>
                <p style={{ position: 'relative', fontSize: 14, color: 'var(--plan-muted)' }}>{t.profile.newThisMonth(subscription.sips_this_month, subscription.sips_per_month >= 1000 ? '∞' : String(subscription.sips_per_month))}</p>
                {subscription.plan === 'free' && <p style={{ position: 'relative', fontSize: 14, color: 'var(--plan-muted)' }}>{t.profile.freeNote}</p>}
                {subscription.subscription && (() => {
                  const sub = subscription.subscription
                  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long' }) : '')
                  const yearly = sub.interval === 'year'
                  return (
                    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p role={sub.status === 'past_due' ? 'alert' : undefined} style={{ fontSize: 14, fontWeight: 500, color: sub.status === 'past_due' ? 'var(--rose-ink)' : 'var(--plan-muted)' }}>
                        {sub.status === 'past_due'
                          ? t.profile.pastDue(day(subscription.plan_expires_at))
                          : sub.cancel_at_period_end
                            ? t.profile.cancelled(day(sub.current_period_end))
                            : t.profile.renews(yearly, day(sub.current_period_end))}
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button variant="soft" onClick={() => portal.mutate('manage')} disabled={portal.isPending || busy} style={{ flex: 1, fontSize: 15, height: 'auto', minHeight: 48, boxShadow: 'none' }}>
                          {sub.status === 'past_due' ? t.profile.updatePayment : t.profile.manage}
                        </Button>
                        {!sub.cancel_at_period_end && (
                          <Button variant="ghost" onClick={() => portal.mutate('cancel')} disabled={portal.isPending || busy} style={{ flex: 1, fontSize: 15, height: 'auto', minHeight: 48, color: 'var(--plan-ink)', boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--plan-ink) 18%, transparent)' }}>
                            {t.profile.cancel}
                          </Button>
                        )}
                      </div>
                      {portal.isError && <p role="alert" style={{ color: 'var(--coral)', fontSize: 14 }}>{apiErrorMessage(portal.error)}</p>}
                    </div>
                  )
                })()}
                {subscription.trial_available ? (
                  <Button onClick={() => trial.mutate()} disabled={trial.isPending || busy} style={{ position: 'relative', fontSize: 15, padding: '12px 16px', height: 'auto', minHeight: 52 }}>
                    {trial.isPending ? t.profile.trialActivating : t.profile.tryEssential(subscription.trial_days)}
                  </Button>
                ) : null}
                <button type="button" onClick={() => nav('/offers')} style={{ position: 'relative', alignSelf: 'flex-start', border: 'none', background: 'none', padding: '6px 0', fontSize: 15, fontWeight: 700, color: 'var(--plan-ink)' }}>
                  {t.upsell.offers} →
                </button>
                {trial.isError && <p role="alert" style={{ color: 'var(--coral)', fontSize: 14 }}>{t.upsell.trialFailed}</p>}
              </>
            ) : (
              <p role="status" style={{ position: 'relative', color: 'var(--plan-muted)' }}>{plan.isError ? t.profile.subUnavailable : t.profile.subLoading}</p>
            )}
          </motion.section>

          <motion.section variants={item} aria-labelledby="profile-settings" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 id="profile-settings" className="title-m" style={{ margin: '6px 6px 0' }}>{t.profile.settings}</h2>
            <HabitSettings />
            <div className="card" style={{ borderRadius: 24, overflow: 'hidden' }}>
              <button
                type="button"
                role="switch"
                aria-checked={sound}
                onClick={() => {
                  setSound(!sound)
                  setSoundEnabled(!sound)
                }}
                style={{ ...rowStyle, cursor: 'pointer' }}
              >
                <span style={{ width: 36, height: 36, borderRadius: 18, background: 'var(--peach-soft)', color: 'var(--primary)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{Icon.sound(sound)}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{t.profile.sound}</span>
                <span style={{ width: 52, height: 32, borderRadius: 16, padding: 3, display: 'flex', flexShrink: 0, justifyContent: sound ? 'flex-end' : 'flex-start', background: sound ? 'var(--primary)' : 'var(--bg-deep)' }}>
                  <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 30 }} style={{ width: 26, height: 26, borderRadius: 13, background: '#fff' }} />
                </span>
              </button>
              <button type="button" onClick={() => exportData.mutate()} disabled={exportData.isPending || busy} aria-busy={exportData.isPending} style={{ ...rowStyle, borderTop: '1.5px solid var(--bg-deep)' }}>
                {rowIcon('var(--sky)', 'var(--sky-ink)', 'M12 4v11M7 10l5 5 5-5M5 20h14')}
                {exportData.isPending ? t.profile.exporting : t.profile.export}
              </button>
              <a href="mailto:hello@sipp.app" style={{ ...rowStyle, borderTop: '1.5px solid var(--bg-deep)' }}>
                {rowIcon('var(--butter)', 'var(--butter-ink)', 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.5M12 17h.01')}
                {t.profile.help}
              </a>
              <button type="button" onClick={() => logout.mutate()} disabled={busy} style={{ ...rowStyle, borderTop: '1.5px solid var(--bg-deep)' }}>
                {rowIcon('var(--bg-deep)', 'var(--muted)', 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 8l-4 4 4 4M6 12h10')}
                {logout.isPending ? t.profile.loggingOut : t.profile.logout}
              </button>
            </div>
            {exportData.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14 }}>{t.profile.exportFailed}</p>}
          </motion.section>

          <motion.section variants={item} aria-label={t.profile.account} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              type="button"
              disabled={busy}
              aria-expanded={confirmDelete}
              aria-controls="profile-delete-confirmation"
              onClick={() => {
                setConfirmDelete(!confirmDelete)
                setPassword('')
                deleteAccount.reset()
              }}
              style={{ border: 'none', background: 'transparent', color: 'var(--rose-ink)', fontSize: 14, fontWeight: 600, padding: '12px 0' }}
            >
              {t.profile.delete}
            </button>
            {confirmDelete && (
              <form
                id="profile-delete-confirmation"
                className="well"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (password && !busy) deleteAccount.mutate(password)
                }}
                style={{ borderRadius: 24, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <p className="muted" style={{ fontSize: 14 }}>{t.profile.deleteWarning(!!subscription?.subscription)}</p>
                <div className="field">
                  <label htmlFor="profile-password" style={{ color: 'var(--muted)' }}>{t.profile.password}</label>
                  <input
                    id="profile-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    disabled={busy}
                    value={password}
                    aria-invalid={deleteAccount.isError}
                    aria-describedby={deleteAccount.isError ? 'profile-delete-error' : undefined}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      deleteAccount.reset()
                    }}
                  />
                </div>
                {deleteAccount.isError && (
                  <p id="profile-delete-error" role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14, fontWeight: 600 }}>
                    {deleteAccount.error instanceof ApiError && deleteAccount.error.status === 403
                      ? t.profile.wrongPassword
                      : apiErrorMessage(deleteAccount.error, t.profile.deleteFailed)}
                  </p>
                )}
                <Button type="submit" disabled={busy || !password} style={{ background: 'var(--rose-ink)', color: '#fff', fontSize: 16 }}>
                  {deleteAccount.isPending ? t.profile.deleting : t.profile.deleteForever}
                </Button>
                <Button variant="ghost" type="button" disabled={busy} onClick={() => { setConfirmDelete(false); setPassword(''); deleteAccount.reset() }} style={{ height: 44, fontSize: 15 }}>{t.common.cancel}</Button>
              </form>
            )}
          </motion.section>
        </motion.div>
      </div>
    </Screen>
  )
}
