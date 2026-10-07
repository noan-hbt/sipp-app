import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button, Icon, IconButton, ProgressBar } from '../components/ui'
import { Api, type SipDetail } from '../lib/api'
import { play } from '../lib/sound'

const LEVEL: Record<string, string> = {
  none: 'grand débutant',
  beginner: 'débutant',
  intermediate: 'intermédiaire',
  advanced: 'à l’aise',
  expert: 'expert',
}
const CHIP_COLORS = [
  ['var(--mint)', 'var(--mint-ink)'],
  ['var(--peach-soft)', 'var(--peach-ink)'],
  ['var(--lavender)', 'var(--lavender-ink)'],
  ['var(--sky)', 'var(--sky-ink)'],
]

function progressOf(sip: SipDetail | undefined) {
  if (!sip) return { step: 0, mapping: 0, modules: 0 }
  const stage = sip.stage ?? ''
  if (sip.status === 'ready') {
    const first = sip.modules[0]?.lessons[0]
    return { step: first?.status === 'ready' ? 4 : 3, mapping: 1, modules: sip.modules.length }
  }
  if (stage.startsWith('mapping')) {
    const [i, n] = stage.split(':')[1].split('/').map(Number)
    return { step: 2, mapping: (i - 1) / n, modules: n }
  }
  if (stage === 'curriculum') return { step: 1, mapping: 0, modules: 0 }
  return { step: 0, mapping: 0, modules: 0 }
}

export function Generating() {
  const { sipId = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const sip = useQuery({
    queryKey: ['sip', sipId],
    queryFn: () => Api.sip(sipId),
    refetchInterval: (q) => {
      const s = q.state.data
      return s && (s.status === 'failed' || (s.status === 'ready' && s.modules[0]?.lessons[0]?.status === 'ready')) ? false : 2000
    },
  })
  const retry = useMutation({
    mutationFn: () => Api.retrySip(sipId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sip', sipId] }),
  })
  const { step, mapping, modules } = progressOf(sip.data)
  const failed = sip.data?.status === 'failed'
  const lastStep = useRef(step)

  useEffect(() => {
    if (step > lastStep.current) play(step === 4 ? 'complete' : 'unlock')
    lastStep.current = step
    if (step === 4) {
      const t = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['sips'] })
        nav(`/sips/${sipId}`, { replace: true, state: { fresh: true } })
      }, 1600)
      return () => clearTimeout(t)
    }
  }, [step, nav, qc, sipId])

  const profile = sip.data?.profile
  const chips = profile
    ? [
        ...(profile.level_details.length
          ? profile.level_details.slice(0, 3).map((d) => `${d.area} : ${LEVEL[d.level] ?? d.level}`)
          : [`Niveau : ${LEVEL[profile.current_level] ?? profile.current_level}`]),
        profile.goals[0],
      ].filter(Boolean)
    : []

  const steps = [
    'Comprendre ton objectif',
    modules ? `Tracer le chemin · ${modules} modules` : 'Tracer le chemin',
    'Découper en leçons de 5 min',
    'Préparer ta première leçon',
  ]

  return (
    <Screen kind="fade">
      <header className="topbar">
        <IconButton label="Fermer" onClick={() => nav('/', { replace: true })}>
          {Icon.close}
        </IconButton>
      </header>

      <div className="scroll" style={{ padding: '6px 22px calc(var(--safe-bottom) + 28px)', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <motion.div
            className="raised"
            animate={step === 4 ? { scale: [1, 1.08, 1] } : {}}
            style={{ width: 136, height: 136, borderRadius: 68, display: 'grid', placeItems: 'center' }}
          >
            <div className="inset" style={{ width: 108, height: 108, borderRadius: 54, display: 'grid', placeItems: 'center' }}>
              <Mascot mood={failed ? 'oops' : step === 4 ? 'bravo' : 'think'} size={80} />
            </div>
          </motion.div>
          <AnimatePresence mode="wait">
            <motion.h1
              key={failed ? 'f' : step === 4 ? 'd' : 'w'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="title-l"
            >
              {failed ? 'Oups, j’ai buggé' : step === 4 ? 'Ton parcours est prêt !' : 'Je prépare ton parcours…'}
            </motion.h1>
          </AnimatePresence>
          <p className="muted" style={{ fontSize: 15, fontWeight: 700 }}>
            {failed ? 'Ça arrive. On relance ?' : '« ' + (sip.data?.input_text ?? '…').slice(0, 110) + ((sip.data?.input_text.length ?? 0) > 110 ? '… »' : ' »')}
          </p>
        </div>

        <AnimatePresence>
          {chips.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="raised"
              style={{ borderRadius: 26, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <span style={{ fontSize: 15, fontWeight: 900 }}>Ce que j’ai compris</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {chips.map((c, i) => (
                  <motion.span
                    key={c}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.15 + i * 0.12 }}
                    onAnimationComplete={() => i === 0 && play('pop')}
                    className="chip"
                    style={{ background: CHIP_COLORS[i % 4][0], color: CHIP_COLORS[i % 4][1], fontSize: 14 }}
                  >
                    {c}
                  </motion.span>
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {failed ? (
          <Button onClick={() => retry.mutate()} disabled={retry.isPending}>
            Réessayer
          </Button>
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {steps.map((label, i) => {
              const state = step > i ? 'done' : step === i ? 'active' : 'todo'
              return (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <motion.span
                    initial={false}
                    animate={{ scale: state === 'active' ? [1, 1.12, 1] : 1 }}
                    transition={state === 'active' ? { duration: 1.4, repeat: Infinity } : { type: 'spring' }}
                    className={state === 'todo' ? 'inset' : undefined}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      background: state === 'done' ? 'var(--mint)' : state === 'active' ? 'var(--peach)' : undefined,
                      boxShadow: state === 'done' ? '0 3px 0 var(--mint-lip)' : state === 'active' ? '0 3px 0 var(--peach-lip)' : undefined,
                    }}
                  >
                    <AnimatePresence>
                      {state === 'done' && (
                        <motion.span initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }} style={{ display: 'grid' }}>
                          {Icon.check(16, '#2F7A52')}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {state === 'active' && <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--ink)' }} />}
                  </motion.span>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontWeight: state === 'active' ? 900 : 800, fontSize: 16, color: state === 'todo' ? 'var(--faint)' : 'var(--ink)', transition: 'color .3s' }}>{label}</span>
                    {i === 2 && state === 'active' && <ProgressBar value={mapping} height={12} />}
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        <p className="muted" style={{ marginTop: 'auto', textAlign: 'center', fontSize: 14, fontWeight: 700 }}>
          Tu peux fermer l’app, je continue sans toi.
        </p>
      </div>
    </Screen>
  )
}
