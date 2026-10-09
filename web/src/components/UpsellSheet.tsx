import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Api } from '../lib/api'
import { track } from '../lib/telemetry'
import { BottomSheet } from './BottomSheet'
import { illustration } from './SipIcon'
import { Button } from './ui'

export type Feature = 'audio' | 'quiz' | 'notes' | 'help'

const COPY: Record<Feature, { title: string; body: string; image: string }> = {
  audio: { title: 'Écoute tes leçons', body: 'Avec Essentiel, Sipp te lit chaque leçon à voix haute : parfait dans les transports ou les yeux fermés.', image: 'scene-listen' },
  quiz: { title: 'Le quiz de fin de module', body: 'Avec Essentiel, chaque module se termine par un quiz qui ancre ce que tu as appris, et rapporte jusqu’à 3 étoiles.', image: 'scene-quiz' },
  notes: { title: 'Ton carnet est plein', body: 'Avec Essentiel, garde autant de passages que tu veux dans ton carnet.', image: 'scene-notes' },
  help: { title: 'Plus d’aide chaque jour', body: 'Tu as utilisé tes explications du jour. Avec Essentiel, demande jusqu’à 30 réexplications par jour.', image: 'scene-premium' },
}

/** A paid feature was touched: what it brings, the free trial if still available, the offers. */
export function UpsellSheet({ feature, onClose }: { feature: Feature | null; onClose: () => void }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const plan = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  const trial = useMutation({
    mutationFn: Api.startTrial,
    onSuccess: (p) => {
      track('trial_started', { from: `upsell_${feature}` })
      qc.setQueryData(['plan'], p)
      onClose()
    },
  })
  useEffect(() => {
    if (feature) track('upsell_shown', { feature })
  }, [feature])
  const copy = COPY[feature ?? 'audio']
  return (
    <BottomSheet open={!!feature} label={copy.title} busy={trial.isPending} onClose={onClose}>
      <img src={illustration(copy.image)} alt="" width={150} height={150} style={{ alignSelf: 'center' }} onError={(e) => { e.currentTarget.src = illustration('scene-celebrate') }} />
      <h2 className="title-m" style={{ textAlign: 'center' }}>{copy.title}</h2>
      <p className="muted" style={{ fontSize: 15, lineHeight: 1.45, textAlign: 'center' }}>{copy.body}</p>
      {plan.data?.trial_available ? (
        <Button data-autofocus onClick={() => trial.mutate()} disabled={trial.isPending}>
          {trial.isPending ? 'Activation…' : `Essayer gratuitement · ${plan.data.trial_days} jours`}
        </Button>
      ) : (
        <Button data-autofocus onClick={() => { onClose(); nav('/offers') }}>Voir les offres</Button>
      )}
      {trial.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14, textAlign: 'center' }}>L’essai n’a pas pu démarrer. Réessaie dans un instant.</p>}
      {plan.data?.trial_available && (
        <Button variant="ghost" onClick={() => { onClose(); nav('/offers') }} style={{ height: 44, fontSize: 16 }}>Voir les offres</Button>
      )}
      <Button variant="ghost" onClick={onClose} disabled={trial.isPending} style={{ height: 44, fontSize: 16, color: 'var(--muted)' }}>Plus tard</Button>
    </BottomSheet>
  )
}

/** The current plan's unlocked features; everything is open while the plan is loading or unknown. */
export function useFeatures() {
  const plan = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  return plan.data?.features ?? { audio: true, quiz: true, notes: 0, help_per_day: 30 }
}
