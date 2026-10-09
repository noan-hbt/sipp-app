import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BlockView, feedbackFor, type Answer } from '../blocks/Blocks'
import { HelpSheet } from '../components/HelpSheet'
import { ErrorNotice } from '../components/ErrorNotice'
import { Mascot } from '../components/Mascot'
import { RichText } from '../components/RichText'
import { Screen } from '../components/Screen'
import { Button, Icon, IconButton, ProgressBar } from '../components/ui'
import { Api, apiErrorMessage, getSessionId, type HelpKind, type LessonOut } from '../lib/api'
import { blockText, isGraded, isInteractive, isKeepable, type Block } from '../lib/blocks'
import { speak, speechSupported, stopSpeaking } from '../lib/speech'
import { useLessonResume } from '../lib/resume'
import { haptic, play } from '../lib/sound'
import { track } from '../lib/telemetry'

const PRAISE = ['Bien vu !', 'Exactement !', 'Parfait !', 'Bravo !', 'Tout juste !']
const ALMOST = ['Presque !', 'Pas tout à fait…', 'Bien tenté !']

const HELP_HINT_KEY = 'sipp.help-hint'
const KEEP_HINT_KEY = 'sipp.keep-hint'

export function Lesson() {
  const { lessonId = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const session = getSessionId()
  const resume = useLessonResume(lessonId)
  const finishing = useRef(false)
  const lesson = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: ({ signal }) => Api.lesson(lessonId, signal),
    refetchInterval: (q) => (q.state.data && q.state.data.status !== 'ready' && q.state.data.status !== 'failed' ? 2000 : false),
  })
  const data = lesson.data
  const notes = useQuery({ queryKey: ['notes'], queryFn: Api.notes })
  const kept = new Map((notes.data ?? []).filter((n) => n.lesson_id === lessonId).map((n) => [n.block, n.id]))
  const keep = useMutation({
    mutationFn: async ({ block, quote }: { block: number; quote: string }) => {
      const id = kept.get(block)
      if (id) await Api.deleteNote(id)
      else {
        await Api.keepNote(lessonId, { block, quote })
        track('note_kept', { type: data?.blocks?.[block]?.type })
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
  const ready = data?.status === 'ready'
  const resumed = !!data?.completed_at
  useEffect(() => {
    if (ready) track('lesson_opened', { redo: resumed })
  }, [ready, lessonId]) // eslint-disable-line react-hooks/exhaustive-deps

  const complete = useMutation({
    networkMode: 'always',
    mutationFn: async ({ answers, correct, total }: Finished) => {
      await resume.queue.pause()
      if (getSessionId() !== session) throw new DOMException('Session terminée', 'AbortError')
      const r = await Api.complete(lessonId, {
        answers: toList(answers),
        score: { correct, total },
      })
      return { r, correct, total }
    },
    onSuccess: ({ r, correct, total }) => {
      track('lesson_completed', { stars: r.stars, correct, total, blocks: data!.blocks?.length ?? 0 })
      resume.queue.clear()
      void qc.invalidateQueries({ queryKey: ['sip', data!.sip_id] })
      void qc.invalidateQueries({ queryKey: ['sips'] })
      void qc.invalidateQueries({ queryKey: ['stats'] })
      void qc.invalidateQueries({ queryKey: ['lesson', lessonId] })
      nav(`/lessons/${lessonId}/done`, { replace: true, state: { ...r, correct, total, sipId: data!.sip_id, ...doneInfo(data!) } })
    },
    onSettled: () => {
      finishing.current = false
      resume.queue.unpause()
    },
  })

  if (!data || data.status !== 'ready') {
    return <Preparing failed={data?.status === 'failed' || lesson.isError || lesson.isPaused} title={data?.title} error={lesson.error} onClose={() => nav(-1)} onRetry={() => void lesson.refetch()} busy={lesson.isFetching} />
  }

  return (
    <LessonPlayer
      key={data.id}
      title={data.title}
      blocks={data.blocks ?? []}
      resume={data.completed_at ? null : resume.queue.resume ?? data.resume}
      onSave={(step, answers) => resume.queue.save({ step, answers: toList(answers) })}
      saveNotice={resume.state.status === 'error' ? (
        <ErrorNotice message={resume.state.durable ? 'Ta progression reste sur cet appareil. Réessaie de la synchroniser.' : 'Ta progression n’est pas enregistrée. Garde cette page ouverte.'} retry={() => void resume.queue.retry()} />
      ) : resume.queue.resume ? (
        // Saving is silent when it works: a permanent "saved" line only takes room above the lesson.
        <p role="status" className="sr-only">{resume.state.status === 'saving' ? 'Synchronisation de ta progression…' : 'Progression enregistrée'}</p>
      ) : null}
      onClose={() => nav(`/sips/${data.sip_id}`, { replace: true })}
      onFinish={(f) => {
        if (finishing.current) return
        finishing.current = true
        complete.mutate(f)
      }}
      finishing={complete.isPending}
      finishError={complete.isError ? apiErrorMessage(complete.error, 'Ta leçon n’a pas été enregistrée. Réessaie.') : undefined}
      onHelp={(block, kind, question) => (track('help_asked', { kind }), Api.help(lessonId, { block, kind, question }).then((r) => r.answer))}
      kept={new Set(kept.keys())}
      onKeep={(block, quote) => keep.mutate({ block, quote })}
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
  saveNotice,
  onClose,
  onFinish,
  finishing,
  finishError,
  onHelp,
  finishLabel = 'Terminer la leçon',
  kept,
  onKeep,
}: {
  title: string
  blocks: Block[]
  resume?: LessonOut['resume']
  onSave?: (step: number, answers: Record<number, Answer>) => void
  saveNotice?: ReactNode
  onClose: () => void
  onFinish: (f: Finished) => void
  finishing: boolean
  finishError?: string
  /** Explains the given block again; the help button is hidden without it (demo). */
  onHelp?: (block: number, kind: HelpKind, question?: string) => Promise<string>
  finishLabel?: string
  /** Blocks kept as notes; the keep button is hidden without onKeep. */
  kept?: Set<number>
  onKeep?: (block: number, quote: string) => void
}) {
  const [revealed, setRevealed] = useState(() => Math.min(Math.max(1, (resume?.step ?? 0) + 1), Math.max(1, blocks.length)))
  const [answers, setAnswers] = useState<Record<number, Answer>>(() => fromList(resume))
  const [sheetOpen, setSheetOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // First lessons only: point once at the help button, which is easy to miss.
  const [helpHint, setHelpHint] = useState(() => {
    try {
      return !localStorage.getItem(HELP_HINT_KEY)
    } catch {
      return false
    }
  })
  useEffect(() => {
    if (!helpHint || !onHelp) return
    const t = setTimeout(() => dismissHint(), 6000)
    return () => clearTimeout(t)
  }, [helpHint]) // eslint-disable-line react-hooks/exhaustive-deps
  function dismissHint() {
    setHelpHint(false)
    try {
      localStorage.setItem(HELP_HINT_KEY, '1')
    } catch {
      /* private mode */
    }
  }
  // Keeping a passage is a long press: a short confirmation, and a one-time tip.
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(t)
  }, [toast])
  const [keepHint, setKeepHint] = useState(false)
  useEffect(() => {
    if (!onKeep || revealed !== 3) return
    try {
      if (!localStorage.getItem(KEEP_HINT_KEY)) setKeepHint(true)
    } catch { /* private mode */ }
  }, [revealed]) // eslint-disable-line react-hooks/exhaustive-deps
  function dismissKeepHint() {
    setKeepHint(false)
    try { localStorage.setItem(KEEP_HINT_KEY, '1') } catch { /* private mode */ }
  }
  useEffect(() => {
    if (!keepHint) return
    const t = setTimeout(dismissKeepHint, 5000)
    return () => clearTimeout(t)
  }, [keepHint]) // eslint-disable-line react-hooks/exhaustive-deps
  // Read aloud: each block as it appears, until turned off.
  const [listening, setListening] = useState(false)
  useEffect(() => {
    if (!listening || !blocks[revealed - 1]) return
    speak(blockText(blocks[revealed - 1]))
    return () => stopSpeaking()
  }, [listening, revealed]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSpeaking(), [])
  // Between the answer and the feedback sheet: the block shows its result, no bottom bar.
  const [grading, setGrading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const blockRefs = useRef<(HTMLDivElement | null)[]>([])
  const current = blocks[revealed - 1]
  const currentAnswer = answers[revealed - 1]
  const awaiting = current && isInteractive(current) && !currentAnswer
  const isLast = revealed >= blocks.length

  useEffect(() => {
    if (revealed <= 1) return
    // Bring the new block fully into view above the bottom bar; if it is taller than the
    // screen, align its top instead so the learner reads it from the start.
    const t = setTimeout(() => {
      const box = scrollRef.current
      const el = blockRefs.current[revealed - 1]
      if (!box || !el) return
      const visible = box.clientHeight - 150
      const top = el.offsetTop - 12
      const bottom = el.offsetTop + el.offsetHeight
      const target = el.offsetHeight > visible ? top : bottom - visible
      if (target > box.scrollTop) box.scrollTo({ top: target, behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(t)
  }, [revealed])

  // The feedback sheet must not hide the answer it comments: lift the block above it.
  const sheetRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!sheetOpen) return
    const t = setTimeout(() => {
      const box = scrollRef.current
      const el = blockRefs.current[revealed - 1]
      const sheet = sheetRef.current
      if (!box || !el || !sheet) return
      const visible = box.clientHeight - sheet.offsetHeight - 12
      const target = el.offsetTop + el.offsetHeight - visible
      if (target > box.scrollTop) box.scrollTo({ top: target, behavior: 'smooth' })
    }, 120)
    return () => clearTimeout(t)
  }, [sheetOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  function next() {
    if (finishing) return
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
      <header className="topbar" style={{ position: 'relative' }}>
        <IconButton label="Quitter la leçon" onClick={onClose}>
          {Icon.close}
        </IconButton>
        <ProgressBar value={revealed / blocks.length} height={8} />
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--faint)', minWidth: 34, textAlign: 'right' }}>
          {revealed}/{blocks.length}
        </span>
        {speechSupported() && (
          <motion.button
            aria-label={listening ? 'Arrêter la lecture' : 'Écouter la leçon'}
            aria-pressed={listening}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              play('tap')
              if (!listening) track('lesson_listened')
              setListening(!listening)
            }}
            className="icon-btn"
            style={{ background: listening ? 'var(--primary)' : 'var(--peach-soft)', color: listening ? '#fff' : 'var(--primary)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 14v-2a9 9 0 0118 0v2" />
              <path d="M21 15a2 2 0 01-2 2h-1v-6h1a2 2 0 012 2zM3 15a2 2 0 002 2h1v-6H5a2 2 0 00-2 2z" />
            </svg>
          </motion.button>
        )}
        {onHelp && (
          <motion.button
            aria-label="Je n’ai pas compris"
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              play('tap')
              dismissHint()
              setHelpOpen(true)
            }}
            className="icon-btn"
            style={{ background: 'var(--lavender)', color: 'var(--lavender-ink)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 9a3 3 0 115 2.2c-1.2.8-2 1.4-2 2.8" />
              <path d="M12 18h.01" />
            </svg>
          </motion.button>
        )}
        <AnimatePresence>
          {onHelp && helpHint && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ delay: 0.8 }}
              onClick={dismissHint}
              style={{ position: 'absolute', top: 'calc(100% - 4px)', right: 14, zIndex: 5, maxWidth: 220, padding: '10px 12px', borderRadius: '16px 4px 16px 16px', border: 'none', background: 'var(--ink)', color: 'var(--on-ink)', fontSize: 13, fontWeight: 600, lineHeight: 1.35, textAlign: 'left', boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}
            >
              {'Un passage pas clair ? Touche « ? » : je réexplique autrement.'}
            </motion.button>
          )}
        </AnimatePresence>
      </header>
      {saveNotice}

      <div
        ref={scrollRef}
        className="scroll"
        style={{ padding: `6px 20px ${sheetOpen ? 340 : 170}px`, position: 'relative', maskImage: 'linear-gradient(transparent, #000 22px)', WebkitMaskImage: 'linear-gradient(transparent, #000 22px)' }}
      >
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="title-l" style={{ marginBottom: 22 }}>
          <RichText text={title} />
        </motion.h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          {blocks.slice(0, revealed).map((b, i) => (
            <motion.div
              ref={(el) => {
                blockRefs.current[i] = el
              }}
              key={i}
              initial={{ opacity: 0, y: 26, scale: 0.98, filter: 'blur(4px)' }}
              animate={{ opacity: i < revealed - 1 && !isInteractive(b) ? 0.92 : 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            >
              {onKeep && isKeepable(b) ? (
                <Keepable
                  kept={!!kept?.has(i)}
                  onToggle={() => {
                    const was = !!kept?.has(i)
                    onKeep(i, blockText(b))
                    setToast(was ? 'Retiré de ton carnet' : 'Gardé dans ton carnet')
                    dismissKeepHint()
                  }}
                >
                  <BlockView block={b} answer={answers[i]} onAnswer={(a) => onAnswer(i, a)} />
                </Keepable>
              ) : (
                <BlockView block={b} answer={answers[i]} onAnswer={(a) => onAnswer(i, a)} />
              )}
            </motion.div>
          ))}
        </div>
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
            {finishError ? <ErrorNotice message={finishError} retry={next} busy={finishing} /> : <Button onClick={next} disabled={finishing} sound={null}>
              {finishing ? <Mascot mood="think" size={36} /> : isLast ? finishLabel : 'Continuer'}
            </Button>}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sheetOpen && fb && (
          <motion.section
            ref={sheetRef}
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
              borderRadius: '32px 32px 0 0',
              padding: '20px 18px calc(var(--safe-bottom) + 22px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: tone === 'good' ? 'var(--mint)' : tone === 'bad' ? 'var(--rose)' : 'var(--sky)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 58, height: 58, borderRadius: 29, background: 'var(--surface)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Mascot mood={tone === 'good' ? 'bravo' : tone === 'bad' ? 'oops' : 'think'} size={46} />
              </span>
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 14, delay: 0.1 }}
                className="display"
                style={{ fontSize: 24, color: tone === 'good' ? 'var(--mint-ink)' : tone === 'bad' ? 'var(--rose-ink)' : 'var(--sky-ink)' }}
              >
                {tone === 'good' ? PRAISE[revealed % PRAISE.length] : tone === 'bad' ? ALMOST[revealed % ALMOST.length] : 'Voilà ce que j’attendais'}
              </motion.span>
            </div>
            {fb.expected && (
              <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5 }}>
                <RichText text={fb.expected} />
              </p>
            )}
            <p style={{ fontSize: 15, lineHeight: 1.55, color: tone === 'good' ? 'var(--mint-ink)' : tone === 'bad' ? 'var(--rose-ink)' : 'var(--sky-ink)' }}>
              <RichText text={fb.explanation} />
            </p>
            <Button variant={tone === 'good' ? 'mint' : tone === 'bad' ? 'peach' : 'dark'} onClick={next} disabled={finishing} style={{ marginTop: 4 }}>
              {isLast ? finishLabel : tone === 'bad' ? 'Compris' : 'Continuer'}
            </Button>
          </motion.section>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {(toast || keepHint) && (
          <motion.div
            key={toast ?? 'hint'}
            role="status"
            initial={{ opacity: 0, y: 12, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 12, x: '-50%' }}
            onClick={dismissKeepHint}
            style={{ position: 'absolute', left: '50%', bottom: 'calc(var(--safe-bottom) + 104px)', zIndex: 20, maxWidth: 'calc(100% - 48px)', width: 'max-content', padding: '10px 14px', borderRadius: 16, background: 'var(--ink)', color: 'var(--on-ink)', fontSize: 14, fontWeight: 600, lineHeight: 1.35, textAlign: 'center', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Bookmark size={14} filled={!!toast && toast.startsWith('Gardé')} />
            {toast ?? 'Astuce : appuie longuement sur un passage pour le garder dans ton carnet.'}
          </motion.div>
        )}
      </AnimatePresence>
      {onHelp && <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} ask={(kind, question) => onHelp(revealed - 1, kind, question)} />}
    </Screen>
  )
}

function Bookmark({ size = 14, filled }: { size?: number; filled: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  )
}

/** A passage kept by a long press; a small ribbon marks it, and is the way back for keyboards and screen readers. */
function Keepable({ kept, onToggle, children }: { kept: boolean; onToggle: () => void; children: ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [pressing, setPressing] = useState(false)
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
    setPressing(false)
  }
  return (
    <motion.div
      animate={{ scale: pressing ? 0.985 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{ position: 'relative', WebkitTouchCallout: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, a, input, textarea')) return
        start.current = { x: e.clientX, y: e.clientY }
        setPressing(true)
        timer.current = setTimeout(() => {
          cancel()
          haptic(15)
          play('pop')
          onToggle()
        }, 480)
      }}
      onPointerMove={(e) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) cancel()
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    >
      {children}
      <button
        type="button"
        aria-pressed={kept}
        aria-label={kept ? 'Retirer ce passage de mon carnet' : 'Garder ce passage dans mon carnet'}
        onClick={onToggle}
        className={kept ? undefined : 'sr-only'}
        style={kept ? { position: 'absolute', top: -6, right: 10, width: 26, height: 32, border: 'none', padding: 0, borderRadius: '0 0 6px 6px', background: 'var(--sun)', color: 'var(--butter-ink)', display: 'grid', placeItems: 'center', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)' } : undefined}
      >
        {kept && <span style={{ marginTop: -6, display: 'grid' }}><Bookmark size={12} filled /></span>}
      </button>
    </motion.div>
  )
}

function Preparing({ failed, title, error, onClose, onRetry, busy }: { failed: boolean; title?: string; error: unknown; onClose: () => void; onRetry: () => void; busy: boolean }) {
  return (
    <Screen kind="modal">
      <header className="topbar">
        <IconButton label="Fermer" onClick={onClose}>
          {Icon.close}
        </IconButton>
      </header>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '0 32px 80px', textAlign: 'center' }}>
        <div style={{ width: 150, height: 150, borderRadius: 75, display: 'grid', placeItems: 'center', background: 'var(--peach-soft)' }}>
          <Mascot mood={failed ? 'oops' : 'think'} size={104} />
        </div>
        <h1 className="title-l">{failed ? 'Cette leçon m’a résisté' : 'Je prépare ta leçon…'}</h1>
        {title && (
          <p className="muted" style={{ fontSize: 16 }}>
            {title}
          </p>
        )}
        {!failed && (
          <div style={{ width: 200 }}>
            <motion.div style={{ height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--track)' }}>
              <motion.div
                animate={{ x: ['-100%', '220%'] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: '45%', height: '100%', borderRadius: 5, background: 'var(--primary)' }}
              />
            </motion.div>
          </div>
        )}
        {failed && <ErrorNotice message={apiErrorMessage(error, 'Ta leçon n’a pas pu se charger. Réessaie.')} retry={onRetry} busy={busy} />}
      </div>
    </Screen>
  )
}
