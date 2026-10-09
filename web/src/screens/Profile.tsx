import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { HabitSettings } from '../components/HabitSettings'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button, Icon, Star } from '../components/ui'
import { Api, ApiError, apiErrorMessage, setTokens, type Plan } from '../lib/api'
import { setSoundEnabled, soundEnabled } from '../lib/sound'
import { track } from '../lib/telemetry'

const list = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }
const item = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 22 } },
}
const planNames: Record<Plan['plan'], string> = { free: 'Gratuit', basic: 'Essentiel', plus: 'Plus', max: 'Équipe' }
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
      <header className="topbar" style={{ padding: 'calc(var(--safe-top) + 18px) 20px 6px', gap: 14 }}>
        <span style={{ width: 66, height: 66, borderRadius: 33, background: 'var(--peach-soft)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Mascot size={52} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h1 className="display" style={{ fontSize: 27 }}>Moi</h1>
          <p className="muted" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
            {me.data?.email ?? (me.isError ? 'Ton email est indisponible pour le moment.' : 'Chargement…')}
          </p>
        </div>
      </header>

      <div className="scroll" style={{ padding: '14px 16px 130px' }}>
        <motion.div variants={list} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <motion.section variants={item} aria-label="Tes statistiques">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {[
                { label: 'jours de série', value: stats.data?.streak_days, icon: Icon.flame, bg: 'var(--peach-soft)' },
                { label: 'leçons', value: stats.data?.lessons_completed, icon: Icon.check(18, 'var(--mint-ink)'), bg: 'var(--mint)' },
                { label: 'étoiles', value: stats.data?.total_stars, icon: <Star size={18} />, bg: 'var(--butter)' },
              ].map(({ label, value, icon, bg }) => (
                <div key={label} style={{ borderRadius: 20, padding: 12, display: 'flex', flexDirection: 'column', gap: 4, background: bg }}>
                  <span aria-hidden="true" style={{ display: 'grid' }}>{icon}</span>
                  <span className="display" style={{ fontSize: 22 }}>{value ?? '—'}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{label}</span>
                </div>
              ))}
            </div>
            {stats.isError && <p role="status" className="muted" style={{ fontSize: 13, marginTop: 10 }}>Tes statistiques sont indisponibles pour le moment.</p>}
            <button type="button" onClick={() => nav('/progress')} style={{ ...rowStyle, marginTop: 8, borderRadius: 20, background: 'var(--surface)' }}>
              {rowIcon('var(--peach-soft)', 'var(--primary)', 'M4 20V10M10 20V4M16 20v-7M22 20H2')}
              <span style={{ flex: 1, textAlign: 'left' }}>Voir mes progrès</span>
              <span aria-hidden="true" style={{ color: 'var(--faint)' }}>→</span>
            </button>
          </motion.section>

          <motion.section variants={item} aria-label="Ton abonnement" style={{ borderRadius: 28, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--lavender-strong)', position: 'relative', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', right: -30, top: -30, width: 120, height: 120, borderRadius: 60, background: 'rgba(255,255,255,.18)' }} />
            <svg width="26" height="26" viewBox="0 0 24 24" style={{ position: 'absolute', right: 22, top: 20 }} aria-hidden="true">
              <path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" fill="var(--sun)" />
            </svg>
            {subscription ? (
              <>
                <div style={{ position: 'relative' }}>
                  <span className="pill-tag" style={{ display: 'inline-block', background: 'var(--ink)', color: 'var(--on-ink)', fontSize: 12, letterSpacing: '.04em' }}>
                    {subscription.on_trial ? 'ESSAI' : 'OFFRE'} {planNames[subscription.plan].toUpperCase()}
                  </span>
                  <h2 className="title-m" style={{ marginTop: 8 }}>{subscription.on_trial ? 'Ton essai est en cours' : planNames[subscription.plan]}</h2>
                  {subscription.on_trial && subscription.plan_expires_at && (
                    <p style={{ fontSize: 14, marginTop: 2, color: 'var(--lavender-deep)' }}>
                      Essai gratuit · jusqu’au {new Date(subscription.plan_expires_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                    </p>
                  )}
                </div>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--lavender-deep)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Bibliothèque</span>
                    <span>{subscription.slots_used} / {subscription.slots} places</span>
                  </p>
                  <div
                    role="progressbar"
                    aria-label="Emplacements de ta bibliothèque"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(slotsProgress * 100)}
                    aria-valuetext={`${subscription.slots_used}/${subscription.slots} emplacements`}
                    style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,.5)', overflow: 'hidden' }}
                  >
                    <motion.div initial={{ width: 0 }} animate={{ width: `${slotsProgress * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} style={{ height: '100%', borderRadius: 4, background: 'var(--ink)' }} />
                  </div>
                </div>
                <p style={{ position: 'relative', fontSize: 14, color: 'var(--lavender-deep)' }}>Nouveaux Sips ce mois-ci : {subscription.sips_this_month} / {subscription.sips_per_month >= 1000 ? '∞' : subscription.sips_per_month}</p>
                {subscription.plan === 'free' && <p style={{ position: 'relative', fontSize: 14, color: 'var(--lavender-deep)' }}>Parcours courts, préparés avec un modèle plus léger.</p>}
                {subscription.subscription && (() => {
                  const sub = subscription.subscription
                  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '')
                  const kind = sub.interval === 'year' ? 'annuel' : 'mensuel'
                  return (
                    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p role={sub.status === 'past_due' ? 'alert' : undefined} style={{ fontSize: 14, fontWeight: 500, color: sub.status === 'past_due' ? 'var(--rose-ink)' : 'var(--lavender-deep)' }}>
                        {sub.status === 'past_due'
                          ? `Ton dernier paiement a échoué. Mets à jour ton moyen de paiement avant le ${day(subscription.plan_expires_at)} pour garder ton offre.`
                          : sub.cancel_at_period_end
                            ? `Abonnement résilié · actif jusqu’au ${day(sub.current_period_end)}`
                            : `Abonnement ${kind} · renouvelé le ${day(sub.current_period_end)}`}
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button variant="soft" onClick={() => portal.mutate('manage')} disabled={portal.isPending || busy} style={{ flex: 1, fontSize: 15, height: 'auto', minHeight: 48, boxShadow: 'none' }}>
                          {sub.status === 'past_due' ? 'Mettre à jour le paiement' : 'Gérer'}
                        </Button>
                        {!sub.cancel_at_period_end && (
                          <Button variant="ghost" onClick={() => portal.mutate('cancel')} disabled={portal.isPending || busy} style={{ flex: 1, fontSize: 15, height: 'auto', minHeight: 48 }}>
                            Résilier
                          </Button>
                        )}
                      </div>
                      {portal.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14 }}>{apiErrorMessage(portal.error)}</p>}
                    </div>
                  )
                })()}
                {subscription.trial_available ? (
                  <Button variant="soft" onClick={() => trial.mutate()} disabled={trial.isPending || busy} style={{ position: 'relative', fontSize: 15, padding: '12px 16px', height: 'auto', minHeight: 52, boxShadow: 'none' }}>
                    {trial.isPending ? 'Activation de ton essai…' : `Essayer Essentiel gratuitement · ${subscription.trial_days} jours`}
                  </Button>
                ) : null}
                <button type="button" onClick={() => nav('/offers')} style={{ position: 'relative', alignSelf: 'flex-start', border: 'none', background: 'none', padding: '4px 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  Voir les offres
                </button>
                {trial.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14 }}>Ton essai n’a pas pu démarrer. Réessaie dans un instant.</p>}
              </>
            ) : (
              <p role="status" className="muted">{plan.isError ? 'Ton abonnement est indisponible pour le moment.' : 'Chargement de ton abonnement…'}</p>
            )}
          </motion.section>

          <motion.section variants={item} aria-labelledby="profile-settings" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 id="profile-settings" className="title-m" style={{ margin: '6px 6px 0' }}>Réglages</h2>
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
                <span style={{ flex: 1, textAlign: 'left' }}>Effets sonores</span>
                <span style={{ width: 52, height: 32, borderRadius: 16, padding: 3, display: 'flex', flexShrink: 0, justifyContent: sound ? 'flex-end' : 'flex-start', background: sound ? 'var(--primary)' : 'var(--bg-deep)' }}>
                  <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 30 }} style={{ width: 26, height: 26, borderRadius: 13, background: '#fff' }} />
                </span>
              </button>
              <button type="button" onClick={() => exportData.mutate()} disabled={exportData.isPending || busy} aria-busy={exportData.isPending} style={{ ...rowStyle, borderTop: '1.5px solid var(--bg-deep)' }}>
                {rowIcon('var(--sky)', 'var(--sky-ink)', 'M12 4v11M7 10l5 5 5-5M5 20h14')}
                {exportData.isPending ? 'Préparation de ton export…' : 'Exporter mes données'}
              </button>
              <a href="mailto:hello@sipp.app" style={{ ...rowStyle, borderTop: '1.5px solid var(--bg-deep)' }}>
                {rowIcon('var(--butter)', 'var(--butter-ink)', 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.5M12 17h.01')}
                Aide
              </a>
              <button type="button" onClick={() => logout.mutate()} disabled={busy} style={{ ...rowStyle, borderTop: '1.5px solid var(--bg-deep)' }}>
                {rowIcon('var(--bg-deep)', 'var(--muted)', 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 8l-4 4 4 4M6 12h10')}
                {logout.isPending ? 'Déconnexion…' : 'Se déconnecter'}
              </button>
            </div>
            {exportData.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14 }}>Tes données n’ont pas pu être exportées. Réessaie dans un instant.</p>}
          </motion.section>

          <motion.section variants={item} aria-label="Gestion de ton compte" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              Supprimer mon compte
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
                <p className="muted" style={{ fontSize: 14 }}>Ton compte et tes données seront supprimés définitivement{subscription?.subscription ? ', et ton abonnement résilié tout de suite' : ''}. Saisis ton mot de passe pour confirmer.</p>
                <div className="field">
                  <label htmlFor="profile-password" style={{ color: 'var(--muted)' }}>Ton mot de passe</label>
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
                      ? 'Mot de passe incorrect'
                      : apiErrorMessage(deleteAccount.error, 'Ton compte n’a pas pu être supprimé. Réessaie dans un instant.')}
                  </p>
                )}
                <Button type="submit" disabled={busy || !password} style={{ background: 'var(--rose-ink)', color: '#fff', fontSize: 16 }}>
                  {deleteAccount.isPending ? 'Suppression…' : 'Supprimer définitivement'}
                </Button>
                <Button variant="ghost" type="button" disabled={busy} onClick={() => { setConfirmDelete(false); setPassword(''); deleteAccount.reset() }} style={{ height: 44, fontSize: 15 }}>Annuler</Button>
              </form>
            )}
          </motion.section>
        </motion.div>
      </div>
    </Screen>
  )
}
