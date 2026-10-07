import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BlockView, feedbackFor, type Answer } from '../blocks/Blocks'
import { Mascot } from '../components/Mascot'
import { RichText } from '../components/RichText'
import { Screen } from '../components/Screen'
import { Button, Icon, IconButton, ProgressBar } from '../components/ui'
import { Api, ApiError, type LessonOut } from '../lib/api'
import { isGraded, isInteractive, type Block } from '../lib/blocks'
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
  const data = lesson.data

  const complete = useMutation({
    mutationFn: ({ answers, correct, total }: Finished) =>
      Api.complete(lessonId, {
        answers: toList(answers),
        score: { correct, total },
      }).then((r) => ({ r, correct, total })),
    onSuccess: ({ r, correct, total }) => {
      void qc.invalidateQueries({ queryKey: ['sip', data!.sip_id] })
      void qc.invalidateQueries({ queryKey: ['sips'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['lesson', lessonId] })
      nav(`/lessons/${lessonId}/done`, { replace: true, state: { ...r, correct, total, sipId: data!.sip_id, ...doneInfo(data!) } })
    },
  })

  if (!data || data.status !== 'ready') {
    return <Preparing failed={data?.status === 'failed' || lesson.error instanceof ApiError} title={data?.title} onClose={() => nav(-1)} />
  }

  return (
    <LessonPlayer
      key={data.id}
      title={data.title}
      blocks={data.blocks ?? []}
      resume={data.resume}
      onSave={(step, answers) => void Api.saveResume(lessonId, { step, answers: toList(answers) }).catch(() => {})}
      onClose={() => nav(`/sips/${data.sip_id}`, { replace: true })}
      onFinish={(f) => complete.mutate(f)}
      finishing={complete.isPending}
    />
  )
}

export interface Finished {
  answers: Record<number, Answer>
  correct: number
  total: number
}

function toList(answers: Record<number, Answer>) {
  return Object.entries(answers).map(([i, a]) => ({ block: Number(i), ...a }))
}

/** What the end screen shows: the outcome, the key ideas and an optional mini-action. */
export function doneInfo(l: { title: string; objective: string; blocks: Block[] | null }) {
  const blocks = l.blocks ?? []
  const recap = blocks.find((b) => b.type === 'recap')
  const action = blocks.find((b) => b.type === 'application')
  return {
    title: l.title,
    objective: l.objective,
    concepts: recap?.type === 'recap' ? recap.concepts ?? [] : [],
    points: recap?.type === 'recap' ? recap.points : [],
    action: action?.type === 'application' ? action.prompt : null,
  }
}

function fromList(resume: LessonOut['resume']): Record<number, Answer> {
  const out: Record<number, Answer> = {}
  for (const a of resume?.answers ?? []) {
    const { block, ...rest } = a as { block: number } & Answer
    if (typeof block === 'number') out[block] = rest
  }
  return out
}

export function LessonPlayer({
  title,
  blocks,
  resume,
  onSave,
  onClose,
  onFinish,
  finishing,
}: {
  title: string
  blocks: Block[]
  resume?: LessonOut['resume']
  onSave?: (step: number, answers: Record<number, Answer>) => void
  onClose: () => void
  onFinish: (f: Finished) => void
  finishing: boolean
}) {
  const [revealed, setRevealed] = useState(() => Math.min(Math.max(1, (resume?.step ?? 0) + 1), Math.max(1, blocks.length)))
  const [answers, setAnswers] = useState<Record<number, Answer>>(() => fromList(resume))
  const [sheetOpen, setSheetOpen] = useState(false)
  // Between the answer and the feedback sheet: the block shows its result, no bottom bar.
  const [grading, setGrading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const current = blocks[revealed - 1]
  const currentAnswer = answers[revealed - 1]
  const awaiting = current && isInteractive(current) && !currentAnswer
  const isLast = revealed >= blocks.length

  useEffect(() => {
    if (revealed > 1) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [revealed])

  function next() {
    setSheetOpen(false)
    if (isLast) {
      const graded = blocks.map((b, i) => [b, answers[i]] as const).filter(([b]) => isGraded(b))
      onFinish({ answers, correct: graded.filter(([, a]) => a?.correct).length, total: graded.length })
      return
    }
    play('reveal')
    setRevealed((r) => r + 1)
    onSave?.(revealed, answers)
  }

  function onAnswer(i: number, a: Answer) {
    const all = { ...answers, [i]: a }
    setAnswers(all)
    setGrading(true)
    onSave?.(revealed - 1, all)
    setTimeout(
      () => {
        setGrading(false)
        setSheetOpen(true)
      },
      a.correct === null ? 100 : 450,
    )
  }

  const fb = currentAnswer && current ? feedbackFor(current) : null
  const tone = currentAnswer?.correct === true ? 'good' : currentAnswer?.correct === false ? 'bad' : 'neutral'

  return (
    <Screen kind="modal">
      <header className="topbar">
        <IconButton label="Quitter la leçon" onClick={onClose}>
          {Icon.close}
        </IconButton>
        <ProgressBar value={revealed / blocks.length} />
      </header>

      <div className="scroll" style={{ padding: '6px 22px 170px' }}>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="title-l" style={{ marginBottom: 20 }}>
          <RichText text={title} />
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
        {!awaiting && !sheetOpen && !grading && (
          <motion.div
            className="bottom-fade"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            <Button variant={isLast ? 'peach' : 'dark'} onClick={next} disabled={finishing} sound={null}>
              {finishing ? <Mascot mood="think" size={36} /> : isLast ? 'Terminer la leçon' : 'Continuer'}
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
              <Mascot mood={tone === 'good' ? 'bravo' : tone === 'bad' ? 'oops' : 'think'} size={52} />
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
