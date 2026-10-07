import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState, type CSSProperties } from 'react'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button, Icon, Star } from '../components/ui'
import { Api, ApiError, setTokens, type Plan } from '../lib/api'
import { setSoundEnabled, soundEnabled } from '../lib/sound'

const list = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }
const item = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 22 } },
}
const planNames: Record<Plan['plan'], string> = { free: 'Gratuit', basic: 'Essentiel', plus: 'Plus', max: 'Équipe' }
const rowStyle: CSSProperties = {
  border: 'none', background: 'transparent', padding: '16px', display: 'flex', alignItems: 'center',
  minHeight: 54, width: '100%', textAlign: 'left', fontSize: 16, fontWeight: 800,
}

export function Profile() {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: Api.me })
  const stats = useQuery({ queryKey: ['stats'], queryFn: Api.stats })
  const plan = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  const [sound, setSound] = useState(soundEnabled)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [password, setPassword] = useState('')

  const trial = useMutation({
    mutationFn: Api.startTrial,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plan'] }),
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
    mutationFn: async () => {
      await Api.logout().catch(() => undefined)
      queryClient.clear()
      setTokens(null)
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
      <header className="topbar" style={{ padding: 'calc(var(--safe-top) + 18px) 22px 6px', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900 }}>Profil</h1>
          <p className="muted" style={{ fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>
            {me.data?.email ?? (me.isError ? 'Ton email est indisponible pour le moment.' : 'Chargement…')}
          </p>
        </div>
        <div style={{ flexShrink: 0 }}><Mascot size={54} /></div>
      </header>

      <div className="scroll" style={{ padding: '18px 22px 130px' }}>
        <motion.div variants={list} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <motion.section variants={item} aria-label="Tes statistiques">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              {[
                { label: 'Série', value: stats.data?.streak_days, icon: Icon.flame },
                { label: 'Leçons', value: stats.data?.lessons_completed, icon: Icon.list },
                { label: 'Étoiles', value: stats.data?.total_stars, icon: <Star size={20} /> },
              ].map(({ label, value, icon }) => (
                <div key={label} className="card" style={{ borderRadius: 22, padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden="true" style={{ display: 'grid' }}>{icon}</span>
                  <span style={{ fontSize: 24, fontWeight: 900 }}>{value ?? '—'}</span>
                  <span className="muted" style={{ fontSize: 13, fontWeight: 800 }}>{label}</span>
                </div>
              ))}
            </div>
            {stats.isError && <p role="status" className="muted" style={{ fontSize: 13, marginTop: 10 }}>Tes statistiques sont indisponibles pour le moment.</p>}
          </motion.section>

          <motion.section variants={item} className="raised" aria-label="Ton abonnement" style={{ borderRadius: 28, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {subscription ? (
              <>
                <div>
                  <h2 className="title-m">{planNames[subscription.plan]}</h2>
                  {subscription.on_trial && subscription.plan_expires_at && (
                    <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                      Essai gratuit · jusqu'au {new Date(subscription.plan_expires_at).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 800 }}>Bibliothèque : {subscription.slots_used}/{subscription.slots} emplacements</p>
                  <div
                    role="progressbar"
                    aria-label="Emplacements de ta bibliothèque"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(slotsProgress * 100)}
                    aria-valuetext={`${subscription.slots_used}/${subscription.slots} emplacements`}
                    style={{ height: 8, borderRadius: 4, background: 'var(--track)', overflow: 'hidden' }}
                  >
                    <motion.div initial={{ width: 0 }} animate={{ width: `${slotsProgress * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} style={{ height: '100%', borderRadius: 4, background: 'var(--peach)' }} />
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 14, fontWeight: 700 }}>Générations ce mois-ci : {subscription.sips_this_month}/{subscription.sips_per_month}</p>
                {subscription.plan === 'free' && <p className="muted" style={{ fontSize: 14 }}>Parcours courts, préparés avec un modèle plus léger.</p>}
                {subscription.trial_available ? (
                  <Button onClick={() => trial.mutate()} disabled={trial.isPending || busy} style={{ fontSize: 15, padding: '12px 16px', height: 'auto', minHeight: 60 }}>
                    {trial.isPending ? 'Activation de ton essai…' : `Essayer Essentiel gratuitement · ${subscription.trial_days} jours`}
                  </Button>
                ) : subscription.plan === 'free' ? (
                  <p className="muted" style={{ fontSize: 14 }}>Les abonnements arrivent bientôt.</p>
                ) : null}
                {trial.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14 }}>Ton essai n’a pas pu démarrer. Réessaie dans un instant.</p>}
              </>
            ) : (
              <p role="status" className="muted">{plan.isError ? 'Ton abonnement est indisponible pour le moment.' : 'Chargement de ton abonnement…'}</p>
            )}
          </motion.section>

          <motion.section variants={item} aria-labelledby="profile-settings" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 id="profile-settings" className="title-m" style={{ marginLeft: 4 }}>Réglages</h2>
            <div className="card" style={{ borderRadius: 26, padding: 8 }}>
              <button
                type="button"
                role="switch"
                aria-checked={sound}
                onClick={() => {
                  setSound(!sound)
                  setSoundEnabled(!sound)
                }}
                className="raised-sm"
                style={{ width: '100%', border: 'none', borderRadius: 22, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 16, fontWeight: 800 }}
              >
                {Icon.sound(sound)}
                <span style={{ flex: 1, textAlign: 'left' }}>Effets sonores</span>
                <span className="inset" style={{ width: 54, height: 32, borderRadius: 16, padding: 3, display: 'flex', flexShrink: 0, justifyContent: sound ? 'flex-end' : 'flex-start' }}>
                  <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 30 }} style={{ width: 26, height: 26, borderRadius: 13, background: sound ? 'var(--peach)' : 'var(--faint)' }} />
                </span>
              </button>
              <button type="button" onClick={() => exportData.mutate()} disabled={exportData.isPending || busy} aria-busy={exportData.isPending} style={rowStyle}>
                {exportData.isPending ? 'Préparation de ton export…' : 'Exporter mes données'}
              </button>
              <a href="mailto:hello@sipp.app" style={{ ...rowStyle, borderTop: '1px solid var(--track)' }}>Aide</a>
            </div>
            {exportData.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14 }}>Tes données n’ont pas pu être exportées. Réessaie dans un instant.</p>}
          </motion.section>

          <motion.section variants={item} aria-label="Gestion de ton compte" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Button variant="ghost" onClick={() => logout.mutate()} disabled={busy} style={{ height: 50, fontSize: 16, color: 'var(--rose-ink)' }}>
              {logout.isPending ? 'Déconnexion…' : 'Se déconnecter'}
            </Button>
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
              style={{ border: 'none', background: 'transparent', color: 'var(--rose-ink)', fontSize: 14, fontWeight: 800, padding: '12px 0' }}
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
                <p className="muted" style={{ fontSize: 14 }}>Ton compte et tes données seront supprimés définitivement. Saisis ton mot de passe pour confirmer.</p>
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
                  <p id="profile-delete-error" role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14, fontWeight: 800 }}>
                    {deleteAccount.error instanceof ApiError && deleteAccount.error.status === 403 ? 'Mot de passe incorrect' : 'Ton compte n’a pas pu être supprimé. Réessaie dans un instant.'}
                  </p>
                )}
                <Button type="submit" disabled={busy || !password} style={{ background: 'var(--rose)', color: 'var(--rose-ink)', boxShadow: '0 5px 0 var(--rose-ink), 0 12px 20px rgba(120,80,40,.18)', fontSize: 16 }}>
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
