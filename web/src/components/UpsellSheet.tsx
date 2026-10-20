import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Api } from '../lib/api'
import { track } from '../lib/telemetry'
import { BottomSheet } from './BottomSheet'
import { illustration } from './SipIcon'
import { Button } from './ui'
import { t } from '../lib/i18n'

export type Feature = 'audio' | 'quiz' | 'notes' | 'help'

const IMAGES: Record<Feature, string> = { audio: 'scene-listen', quiz: 'scene-quiz', notes: 'scene-notes', help: 'scene-premium' }
const COPY: Record<Feature, { title: string; body: string; image: string }> = {
  audio: { ...t.upsell.audio, image: IMAGES.audio },
  quiz: { ...t.upsell.quiz, image: IMAGES.quiz },
  notes: { ...t.upsell.notes, image: IMAGES.notes },
  help: { ...t.upsell.help, image: IMAGES.help },
}

/** A paid feature was touched: what it brings, then the offers (with Apple's free trial when still available). */
export function UpsellSheet({ feature, onClose }: { feature: Feature | null; onClose: () => void }) {
  const nav = useNavigate()
  const plan = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  useEffect(() => {
    if (feature) track('upsell_shown', { feature })
  }, [feature])
  const copy = COPY[feature ?? 'audio']
  return (
    <BottomSheet open={!!feature} label={copy.title} onClose={onClose}>
      <img src={illustration(copy.image)} alt="" width={150} height={150} style={{ alignSelf: 'center' }} onError={(e) => { e.currentTarget.src = illustration('scene-celebrate') }} />
      <h2 className="title-m" style={{ textAlign: 'center' }}>{copy.title}</h2>
      <p className="muted" style={{ fontSize: 15, lineHeight: 1.45, textAlign: 'center' }}>{copy.body}</p>
      <Button data-autofocus onClick={() => { track('upsell_clicked', { feature }); onClose(); nav('/offers') }}>
        {plan.data?.trial_available ? t.upsell.trial(plan.data.trial_days) : t.upsell.offers}
      </Button>
      <Button variant="ghost" onClick={onClose} style={{ height: 44, fontSize: 16, color: 'var(--muted)' }}>{t.demo.later}</Button>
    </BottomSheet>
  )
}

/** The current plan's unlocked features; everything is open while the plan is loading or unknown. */
export function useFeatures() {
  const plan = useQuery({ queryKey: ['plan'], queryFn: Api.plan })
  return plan.data?.features ?? { audio: true, quiz: true, notes: 0, help_per_day: 30 }
}
