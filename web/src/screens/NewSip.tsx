import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, ApiError } from '../lib/api'
import { play } from '../lib/sound'

const IDEAS = [
  { label: 'Les bases de la photo', text: 'Je veux apprendre les bases de la photo avec mon téléphone', bg: 'var(--lavender)', ink: 'var(--lavender-ink)' },
  { label: 'Lire un bilan', text: 'Je veux savoir lire le bilan comptable d’une entreprise, je pars de zéro', bg: 'var(--mint)', ink: 'var(--mint-ink)' },
  { label: 'Comment marche le sommeil', text: 'Je veux comprendre comment fonctionne le sommeil et comment mieux dormir', bg: 'var(--sky)', ink: 'var(--sky-ink)' },
  { label: 'L’histoire de Rome', text: 'Je veux connaître les grandes étapes de l’histoire de la Rome antique', bg: 'var(--butter)', ink: 'var(--butter-ink)' },
]

const ERRORS: Record<string, string> = {
  daily_sip_limit: 'Tu as déjà lancé beaucoup de Sips aujourd’hui. Reviens demain !',
  daily_budget_reached: 'J’ai assez réfléchi pour aujourd’hui. On reprend demain ?',
  too_many_active_builds: 'Je construis déjà plusieurs parcours. Attends qu’ils soient prêts.',
}

export function NewSip() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const create = useMutation({
    mutationFn: Api.createSip,
    onSuccess: (sip) => {
      play('whoosh')
      void qc.invalidateQueries({ queryKey: ['sips'] })
      nav(`/sips/${sip.id}/building`, { replace: true })
    },
    onError: () => play('wrong'),
  })
  const err = create.error instanceof ApiError ? (ERRORS[create.error.code ?? ''] ?? 'Oups, réessaie dans un instant.') : create.error ? 'Impossible de joindre Sipp.' : null

  return (
    <Screen>
      <header className="topbar">
        <IconButton label="Retour" onClick={() => nav(-1)}>
          {Icon.back}
        </IconButton>
      </header>

      <div className="scroll" style={{ padding: '10px 22px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <Mascot mood={err ? 'oops' : text.length > 20 ? 'think' : 'hello'} size={72} />
          <motion.div
            initial={{ scale: 0.6, opacity: 0, originX: 0, originY: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.15 }}
            className="raised"
            style={{ borderRadius: '24px 24px 24px 6px', padding: '14px 16px', marginBottom: 16 }}
          >
            <h1 style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>{err ?? 'Qu’est-ce que tu veux apprendre ?'}</h1>
          </motion.div>
        </div>

        <motion.div className="field" style={{ borderRadius: 26, padding: 18 }} animate={create.isError ? { x: [0, -8, 8, -4, 0] } : {}}>
          <label htmlFor="wish">Dis-le avec tes mots</label>
          <textarea
            id="wish"
            rows={5}
            maxLength={4000}
            autoFocus
            placeholder="Ex : je veux comprendre comment marche l’inflation, j’ai des bases d’éco du lycée"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ fontSize: 18, lineHeight: 1.45 }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#8E8272' }}>Astuce : ton niveau et ton objectif m’aident à viser juste.</span>
        </motion.div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 900 }}>En panne d’idée ?</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {IDEAS.map((idea, i) => (
              <motion.button
                key={idea.label}
                initial={{ opacity: 0, scale: 0.7, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.25 + i * 0.06 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  play('pop')
                  setText(idea.text)
                }}
                className="raised-sm"
                style={{ height: 44, padding: '0 16px', borderRadius: 22, border: 'none', background: idea.bg, color: idea.ink, fontSize: 15, fontWeight: 800 }}
              >
                {idea.label}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      <div className="bottom-bar">
        <Button disabled={text.trim().length < 3 || create.isPending} onClick={() => create.mutate(text.trim())} sound="pop">
          {create.isPending ? <Mascot mood="think" size={36} bob={false} /> : 'Construis mon parcours'}
        </Button>
      </div>
    </Screen>
  )
}
