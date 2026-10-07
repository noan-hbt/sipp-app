import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BlockView, feedbackFor, type Answer } from '../blocks/Blocks'
import { Mascot } from '../components/Mascot'
import { RichText } from '../components/RichText'
import { Screen } from '../components/Screen'
import { Button, Icon, IconButton, ProgressBar } from '../components/ui'
import { Api, ApiError } from '../lib/api'
import { isGraded, isInteractive } from '../lib/blocks'
import { play } from '../lib/sound'

const PRAISE = ['Bien vu !', 'Exactement !', 'Parfait !', 'Bravo !', 'Tout juste !']
const ALMOST = ['Presque !', 'Pas tout à fait…', 'Bien tenté !']

export function Lesson() {
  const { lessonId = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const lesson = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => Api.lesson(lessonId),
    refetchInterval: (q) => (q.state.data && q.state.data.status !== 'ready' && q.state.data.status !== 'failed' ? 2000 : false),
  })
  const [revealed, setRevealed] = useState(1)
  const [answers, setAnswers] = useState<Record<number, Answer>>({})
  const [sheetOpen, setSheetOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const blocks = lesson.data?.status === 'ready' ? (lesson.data.blocks ?? []) : []
  const current = blocks[revealed - 1]
  const currentAnswer = answers[revealed - 1]
  const awaiting = current && isInteractive(current) && !currentAnswer
  const isLast = revealed >= blocks.length

  const complete = useMutation({
    mutationFn: () => {
      const graded = blocks.map((b, i) => [b, answers[i]] as const).filter(([b]) => isGraded(b))
      const correct = graded.filter(([, a]) => a?.correct).length
      return Api.complete(lessonId, {
        answers: Object.entries(answers).map(([i, a]) => ({ block: Number(i), ...a })),
        score: { correct, total: graded.length },
      }).then((r) => ({ r, correct, total: graded.length }))
    },
    onSuccess: ({ r, correct, total }) => {
      void qc.invalidateQueries({ queryKey: ['sip', lesson.data!.sip_id] })
      void qc.invalidateQueries({ queryKey: ['sips'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      const recap = blocks.find((b) => b.type === 'recap')
      nav(`/lessons/${lessonId}/done`, {
        replace: true,
        state: { ...r, correct, total, sipId: lesson.data!.sip_id, title: lesson.data!.title, concepts: recap?.type === 'recap' ? recap.concepts ?? [] : [] },
      })
    },
  })

  useEffect(() => {
    if (revealed > 1) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [revealed])

  function next() {
    setSheetOpen(false)
    if (isLast) {
      complete.mutate()
      return
    }
    play('reveal')
    setRevealed((r) => r + 1)
  }

  function onAnswer(i: number, a: Answer) {
    setAnswers((s) => ({ ...s, [i]: a }))
    setTimeout(() => setSheetOpen(true), a.correct === null ? 100 : 450)
  }

  if (!lesson.data || lesson.data.status !== 'ready') {
    return <Preparing failed={lesson.data?.status === 'failed' || lesson.error instanceof ApiError} title={lesson.data?.title} onClose={() => nav(-1)} />
  }

  const fb = currentAnswer && current ? feedbackFor(current) : null
  const tone = currentAnswer?.correct === true ? 'good' : currentAnswer?.correct === false ? 'bad' : 'neutral'

  return (
    <Screen kind="modal">
      <header className="topbar">
        <IconButton label="Quitter la leçon" onClick={() => nav(`/sips/${lesson.data!.sip_id}`, { replace: true })}>
          {Icon.close}
        </IconButton>
        <ProgressBar value={revealed / blocks.length} />
      </header>

      <div className="scroll" style={{ padding: '6px 22px 170px' }}>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="title-l" style={{ marginBottom: 20 }}>
          <RichText text={lesson.data.title} />
        </motion.h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {blocks.slice(0, revealed).map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 26, scale: 0.98, filter: 'blur(4px)' }}
              animate={{ opacity: i < revealed - 1 && !isInteractive(b) ? 0.92 : 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            >
              <BlockView block={b} answer={answers[i]} onAnswer={(a) => onAnswer(i, a)} />
            </motion.div>
          ))}
        </div>
        <div ref={endRef} style={{ height: 1 }} />
      </div>

      <AnimatePresence>
        {!awaiting && !sheetOpen && (
          <motion.div
            className="bottom-fade"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            <Button variant={isLast ? 'peach' : 'dark'} onClick={next} disabled={complete.isPending} sound={null}>
              {complete.isPending ? <Mascot mood="think" size={36} bob={false} /> : isLast ? 'Terminer la leçon' : currentAnswer ? 'Continuer' : 'Continuer'}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sheetOpen && fb && (
          <motion.section
            aria-live="polite"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 10,
              borderRadius: '34px 34px 0 0',
              padding: '22px 22px calc(var(--safe-bottom) + 24px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: tone === 'good' ? '#DDF0E3' : tone === 'bad' ? 'var(--rose-soft)' : '#E1ECF7',
              boxShadow: '0 -8px 24px rgba(160,110,90,.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Mascot mood={tone === 'good' ? 'bravo' : tone === 'bad' ? 'oops' : 'think'} size={52} bob={false} />
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.1 }}
                style={{ fontSize: 22, fontWeight: 900, color: tone === 'good' ? '#245E40' : tone === 'bad' ? 'var(--rose-ink)' : 'var(--sky-ink)' }}
              >
                {tone === 'good' ? PRAISE[revealed % PRAISE.length] : tone === 'bad' ? ALMOST[revealed % ALMOST.length] : 'Voilà ce que j’attendais'}
              </motion.span>
            </div>
            {fb.expected && (
              <p style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.5 }}>
                <RichText text={fb.expected} />
              </p>
            )}
            <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.55, color: tone === 'bad' ? '#4A2430' : 'var(--ink-soft)' }}>
              <RichText text={fb.explanation} />
            </p>
            <Button variant={tone === 'good' ? 'mint' : 'dark'} onClick={next} style={{ marginTop: 6 }}>
              {isLast ? 'Terminer la leçon' : tone === 'bad' ? 'Compris' : 'Continuer'}
            </Button>
          </motion.section>
        )}
      </AnimatePresence>
    </Screen>
  )
}

function Preparing({ failed, title, onClose }: { failed: boolean; title?: string; onClose: () => void }) {
  return (
    <Screen kind="modal">
      <header className="topbar">
        <IconButton label="Fermer" onClick={onClose}>
          {Icon.close}
        </IconButton>
      </header>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '0 32px 80px', textAlign: 'center' }}>
        <div className="raised" style={{ width: 150, height: 150, borderRadius: 75, display: 'grid', placeItems: 'center' }}>
          <Mascot mood={failed ? 'oops' : 'think'} size={104} />
        </div>
        <h1 className="title-l">{failed ? 'Cette leçon m’a résisté' : 'Je prépare ta leçon…'}</h1>
        {title && (
          <p className="muted" style={{ fontSize: 16, fontWeight: 800 }}>
            {title}
          </p>
        )}
        {!failed && (
          <div style={{ width: 200 }}>
            <motion.div className="inset" style={{ height: 14, borderRadius: 7, padding: 3, overflow: 'hidden' }}>
              <motion.div
                animate={{ x: ['-100%', '220%'] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: '45%', height: '100%', borderRadius: 4, background: 'var(--peach)' }}
              />
            </motion.div>
          </div>
        )}
        {failed && <p className="muted">Reviens dans un instant, je réessaie de mon côté.</p>}
      </div>
    </Screen>
  )
}
