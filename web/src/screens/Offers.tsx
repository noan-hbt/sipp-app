import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { illustration } from '../components/SipIcon'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, type Plan } from '../lib/api'
import { play } from '../lib/sound'

const NAMES: Record<Plan['plan'], string> = { free: 'Gratuit', basic: 'Essentiel', plus: 'Plus', max: 'Équipe' }

const perks = (p: { slots: number; sips_per_month: number; lite: boolean }) => [
  p.slots === 1 ? '1 Sip à la fois' : `${p.slots} Sips en même temps`,
  p.sips_per_month === 1 ? '1 nouveau Sip par mois' : `${p.sips_per_month} nouveaux Sips par mois`,
  p.lite ? 'Parcours courts' : 'Parcours complets, sur mesure',
]

/** The plans side by side; the trial is the only way in until billing ships. */
export function Offers() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const plans = useQuery({ queryKey: ['plans'], queryFn: Api.plans, staleTime: Infinity })
  const mine = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  const trial = useMutation({
    mutationFn: Api.startTrial,
    onSuccess: (p) => {
      play('complete')
      qc.setQueryData(['plan'], p)
    },
  })
  const current = mine.data?.plan
  const canTry = mine.data?.trial_available ?? false

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

        {(plans.data ?? []).map((p, i) => {
          const isMine = p.name === current
          const highlight = canTry ? p.name === 'basic' : isMine
          return (
            <motion.section
              key={p.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.06 }}
              aria-label={`Offre ${NAMES[p.name]}`}
              style={{
                position: 'relative',
                borderRadius: 22,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                background: highlight ? 'var(--primary-soft)' : 'var(--surface)',
                boxShadow: highlight ? 'inset 0 0 0 2.5px var(--primary)' : 'inset 0 0 0 2px var(--line)',
                marginTop: highlight && canTry ? 6 : 0,
              }}
            >
              {highlight && canTry && (
                <span style={{ position: 'absolute', top: -11, right: 16, padding: '4px 10px', borderRadius: 10, background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                  {mine.data?.trial_days} jours offerts
                </span>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{NAMES[p.name]}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: isMine ? 'var(--primary-ink)' : 'var(--muted)' }}>
                  {isMine ? (mine.data?.on_trial ? 'Ton essai' : 'Ton offre') : p.name === 'free' ? '0 €' : 'Bientôt'}
                </span>
              </div>
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
        {canTry ? (
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
            <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
              Les abonnements arrivent bientôt.
            </p>
          </>
        )}
      </div>
    </Screen>
  )
}
