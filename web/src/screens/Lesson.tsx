import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BlockView, feedbackFor, type Answer } from '../blocks/Blocks'
import { HookSolved } from '../blocks/Play'
import { HelpSheet } from '../components/HelpSheet'
import { ErrorNotice } from '../components/ErrorNotice'
import { Mascot } from '../components/Mascot'
import { RichText } from '../components/RichText'
import { Screen } from '../components/Screen'
import { topicArt } from '../components/SipIcon'
import { Button, Icon, IconButton, ProgressBar } from '../components/ui'
import { UpsellSheet, useFeatures, type Feature } from '../components/UpsellSheet'
import { Api, ApiError, apiErrorMessage, getSessionId, type HelpKind, type LessonOut } from '../lib/api'
import { blockText, checksIn, isInteractive, isKeepable, selfFeedback, type Block, type HookBlock } from '../lib/blocks'
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
  const sip = useQuery({ queryKey: ['sip', data?.sip_id], queryFn: ({ signal }) => Api.sip(data!.sip_id, signal), enabled: !!data?.sip_id })
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
  const features = useFeatures()
  const [upsell, setUpsell] = useState<Feature | null>(null)
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
      onKeep={(block, quote) =>
        keep.mutateAsync({ block, quote }).catch((e) => {
          if (e instanceof ApiError && e.code === 'notes_limit') setUpsell('notes')
          throw e
        })
      }
      onLockedAudio={features.audio ? undefined : () => setUpsell('audio')}
      art={sip.data ? topicArt(sip.data.title, sip.data.theme) : undefined}
      extra={<UpsellSheet feature={upsell} onClose={() => setUpsell(null)} />}
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
  onLockedAudio,
  art,
  extra,
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
  onKeep?: (block: number, quote: string) => Promise<void>
  /** Read aloud is not in the plan: the button shows a lock and calls this instead. */
  onLockedAudio?: () => void
  /** Topic illustration, shown by the opening hook. */
  art?: string
  /** Rendered at the end of the screen (sheets). */
  extra?: ReactNode
}) {
  // One block per screen. `revealed` is the furthest screen reached, `view` the one shown
  // (the learner can step back to re-read).
  const [revealed, setRevealed] = useState(() => Math.min(Math.max(1, (resume?.step ?? 0) + 1), Math.max(1, blocks.length)))
  const [view, setView] = useState(revealed)
  const [dir, setDir] = useState(1)
  const [answers, setAnswers] = useState<Record<number, Answer>>(() => fromList(resume))
  const [sheetOpen, setSheetOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // Right answers in a row: a small flame badge, and a burst at 3, 5, 8...
  const [combo, setCombo] = useState(0)
  const [burst, setBurst] = useState(0)
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
  // Read aloud: each screen as it appears, until turned off.
  const [listening, setListening] = useState(false)
  useEffect(() => {
    if (!listening || !blocks[view - 1]) return
    speak(blockText(blocks[view - 1]))
    return () => stopSpeaking()
  }, [listening, view]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSpeaking(), [])
  // Between the answer and the feedback sheet: the block shows its result, no bottom bar.
  const [grading, setGrading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const i = view - 1
  const current = blocks[i]
  const currentAnswer = answers[i]
  const awaiting = current && isInteractive(current) && !currentAnswer
  const isLast = view >= blocks.length
  const hook = blocks.find((b): b is HookBlock => b.type === 'hook')
  const onColor = current?.type === 'hook'
  const pageBg = onColor ? '#d9622b' : current?.type === 'swipe' ? 'var(--lavender)' : 'var(--bg)'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    if (current?.type === 'recap') {
      play('star')
      setBurst((n) => n + 1)
    }
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  function score() {
    let correct = 0
    let total = 0
    blocks.forEach((b, k) => {
      const a = answers[k]
      if (b.type === 'swipe') {
        const picks = Array.isArray(a?.value) ? (a!.value as boolean[]) : []
        total += b.cards.length
        correct += b.cards.filter((c, j) => picks[j] === c.is_true).length
      } else if (checksIn(b)) {
        total += 1
        correct += a?.correct ? 1 : 0
      }
    })
    return { correct, total }
  }

  function next() {
    if (finishing) return
    setSheetOpen(false)
    if (isLast) {
      onFinish({ answers, ...score() })
      return
    }
    play('whoosh')
    setDir(1)
    setView(view + 1)
    if (view >= revealed) {
      setRevealed(view + 1)
      onSave?.(view, answers)
    }
  }

  function back() {
    if (view <= 1) return
    play('tap')
    setSheetOpen(false)
    setDir(-1)
    setView(view - 1)
  }

  function streak(ok: boolean) {
    setCombo((c) => {
      const n = ok ? c + 1 : 0
      if (n >= 3 && (n === 3 || n === 5 || n % 4 === 0)) {
        setBurst((b) => b + 1)
        setTimeout(() => play('star'), 250)
      }
      return n
    })
  }

  function onAnswer(k: number, a: Answer) {
    const all = { ...answers, [k]: a }
    setAnswers(all)
    onSave?.(revealed - 1, all)
    const b = blocks[k]
    if (b && selfFeedback(b)) return
    if (b && checksIn(b) && a.correct !== null) streak(!!a.correct)
    setGrading(true)
    setTimeout(
      () => {
        setGrading(false)
        setSheetOpen(true)
      },
      a.correct === null ? 100 : 450,
    )
  }

  const fb = currentAnswer && current && !selfFeedback(current) ? feedbackFor(current) : null
  const tone = currentAnswer?.correct === true ? 'good' : currentAnswer?.correct === false ? 'bad' : 'neutral'
  // Solid sheets, the same in light and dark: white text stays readable on all three.
  const sheet = { good: { bg: '#23875a', soft: '#dff7ea', ink: '#1a6a46' }, bad: { bg: '#c8452f', soft: '#ffe4dc', ink: '#9b2f1d' }, neutral: { bg: '#2a6c9e', soft: '#e1f0fb', ink: '#1f5580' } }[tone]
  const chrome = onColor ? { background: 'rgba(255,255,255,.22)', color: '#fff' } : undefined
  const segments = blocks.length <= 18

  const page = current && (
    <>
      {view === 1 && current.type !== 'hook' && (
        <h1 className="title-l" style={{ marginBottom: 18 }}>
          <RichText text={title} />
        </h1>
      )}
      {current.type === 'recap' && hook && (
        <div style={{ marginBottom: 14 }}>
          <HookSolved b={hook} />
        </div>
      )}
      {onKeep && isKeepable(current) ? (
        <Keepable
          kept={!!kept?.has(i)}
          onToggle={() => {
            const was = !!kept?.has(i)
            dismissKeepHint()
            onKeep(i, blockText(current)).then(
              () => setToast(was ? 'Retiré de ton carnet' : 'Gardé dans ton carnet'),
              () => {},
            )
          }}
        >
          <BlockView block={current} answer={currentAnswer} onAnswer={(a) => onAnswer(i, a)} onCheck={streak} title={title} art={art} />
        </Keepable>
      ) : (
        <BlockView block={current} answer={currentAnswer} onAnswer={(a) => onAnswer(i, a)} onCheck={streak} title={title} art={art} />
      )}
    </>
  )

  return (
    <Screen kind="modal">
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: pageBg, transition: 'background .45s ease' }} />
      <header className="topbar" style={{ position: 'relative', gap: 8 }}>
        <IconButton label="Quitter la leçon" onClick={onClose} style={chrome}>
          {Icon.close}
        </IconButton>
        {segments ? (
          <div role="progressbar" aria-label="Avancement de la leçon" aria-valuemin={0} aria-valuemax={blocks.length} aria-valuenow={view} style={{ flex: 1, display: 'flex', gap: 4 }}>
            {blocks.map((_, k) => (
              <span key={k} style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', background: onColor ? 'rgba(255,255,255,.3)' : 'var(--track)' }}>
                <motion.span
                  initial={false}
                  animate={{ scaleX: k < view ? 1 : 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                  style={{ display: 'block', height: '100%', transformOrigin: 'left', background: onColor ? '#fff' : 'var(--primary)' }}
                />
              </span>
            ))}
          </div>
        ) : (
          <ProgressBar value={view / blocks.length} height={8} />
        )}
        {speechSupported() && (
          <motion.button
            aria-label={listening ? 'Arrêter la lecture' : 'Écouter la leçon'}
            aria-pressed={listening}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              play('tap')
              if (onLockedAudio) return onLockedAudio()
              if (!listening) track('lesson_listened')
              setListening(!listening)
            }}
            className="icon-btn"
            style={{ position: 'relative', background: listening ? 'var(--primary)' : onColor ? 'rgba(255,255,255,.22)' : 'var(--peach-soft)', color: listening || onColor ? '#fff' : 'var(--primary)' }}
          >
            {onLockedAudio && (
              <span aria-hidden="true" style={{ position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, background: 'var(--sun)', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 2px var(--bg)' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 018 0v3" />
                </svg>
              </span>
            )}
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
            style={onColor ? { background: 'rgba(255,255,255,.22)', color: '#fff' } : { background: 'var(--lavender)', color: 'var(--lavender-ink)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 9a3 3 0 115 2.2c-1.2.8-2 1.4-2 2.8" />
              <path d="M12 18h.01" />
            </svg>
          </motion.button>
        )}
        <AnimatePresence>
          {onHelp && helpHint && !onColor && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ delay: 0.8 }}
              onClick={dismissHint}
              style={{ position: 'absolute', top: 'calc(100% - 4px)', right: 14, zIndex: 5, maxWidth: 220, padding: '10px 12px', borderRadius: '16px 4px 16px 16px', border: 'none', background: 'var(--ink)', color: 'var(--on-ink)', fontSize: 13, fontWeight: 600, lineHeight: 1.35, textAlign: 'left', boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}
            >
              {'Un passage pas clair ? Touche « ? » : je réexplique autrement.'}
            </motion.button>
          )}
        </AnimatePresence>
        <ComboBadge combo={combo} />
      </header>
      {saveNotice}

      <div ref={scrollRef} className="scroll" style={{ position: 'relative', padding: `10px 20px ${sheetOpen ? 340 : 150}px`, overflowX: 'hidden' }}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={view}
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 48, scale: 0.98 }),
              center: { opacity: 1, x: 0, scale: 1 },
              exit: (d: number) => ({ opacity: 0, x: d * -48, scale: 0.98, transition: { duration: 0.16 } }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ minHeight: '100%' }}
          >
            {page}
          </motion.div>
        </AnimatePresence>
      </div>
      <Burst key={burst} active={burst > 0} />

      <AnimatePresence>
        {!awaiting && !sheetOpen && !grading && (
          <motion.div
            className="bottom-fade"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            style={{ display: 'flex', gap: 10, alignItems: 'center', background: onColor ? 'transparent' : undefined }}
          >
            {view > 1 && (
              <motion.button
                type="button"
                aria-label="Écran précédent"
                whileTap={{ scale: 0.9 }}
                onClick={back}
                style={{ width: 56, height: 56, borderRadius: 28, border: 'none', flexShrink: 0, background: 'var(--surface)', color: 'var(--ink)', display: 'grid', placeItems: 'center' }}
              >
                {Icon.back}
              </motion.button>
            )}
            <div style={{ flex: 1 }}>
              {finishError ? (
                <ErrorNotice message={finishError} retry={next} busy={finishing} />
              ) : (
                <Button onClick={next} disabled={finishing} sound={null} style={onColor ? { background: '#fff', color: '#d9622b' } : undefined}>
                  {finishing ? <Mascot mood="think" size={36} /> : isLast ? finishLabel : current?.type === 'hook' ? 'Je veux savoir' : 'Continuer'}
                </Button>
              )}
            </div>
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
              borderRadius: '32px 32px 0 0',
              padding: '22px 20px calc(var(--safe-bottom) + 22px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: sheet.bg,
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <motion.span
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 12, delay: 0.1 }}
                style={{ width: 56, height: 56, borderRadius: 28, background: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}
              >
                <Mascot mood={tone === 'good' ? 'bravo' : tone === 'bad' ? 'oops' : 'think'} size={46} />
              </motion.span>
              <motion.span
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.08 }}
                className="display"
                style={{ flex: 1, fontSize: 30, lineHeight: 1, letterSpacing: '-0.04em' }}
              >
                {tone === 'good' ? PRAISE[view % PRAISE.length] : tone === 'bad' ? ALMOST[view % ALMOST.length] : 'Voilà ce que j’attendais'}
              </motion.span>
              {tone === 'good' && combo >= 2 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.25, 1] }}
                  transition={{ delay: 0.3, duration: 0.45 }}
                  style={{ height: 34, padding: '0 12px', borderRadius: 17, background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 14, flexShrink: 0 }}
                >
                  <Flame size={14} />
                  {combo} d’affilée
                </motion.span>
              )}
            </div>
            {fb.expected && (
              <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, background: 'rgba(255,255,255,.14)', borderRadius: 16, padding: '10px 12px' }}>
                <RichText text={fb.expected} />
              </p>
            )}
            <p style={{ fontSize: 16, lineHeight: 1.5, color: sheet.soft }}>
              <RichText text={fb.explanation} />
            </p>
            <Button onClick={next} disabled={finishing} style={{ marginTop: 4, background: '#fff', color: sheet.ink }}>
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
      {extra}
      {onHelp && <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} ask={(kind, question) => onHelp(view - 1, kind, question)} />}
    </Screen>
  )
}

function Flame({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z" fill="#ffc93d" />
    </svg>
  )
}

/** Pops under the header each time the streak of right answers grows past one. */
function ComboBadge({ combo }: { combo: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (combo < 2) return setShown(0)
    setShown(combo)
    const t = setTimeout(() => setShown(0), 1600)
    return () => clearTimeout(t)
  }, [combo])
  return (
    <AnimatePresence>
      {shown >= 2 && (
        <motion.span
          key={shown}
          role="status"
          initial={{ opacity: 0, y: -8, scale: 0.6, x: '-50%' }}
          animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
          exit={{ opacity: 0, y: -6, x: '-50%' }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          style={{ position: 'absolute', left: '50%', top: 'calc(100% + 4px)', zIndex: 6, height: 34, padding: '0 14px', borderRadius: 17, background: 'var(--ink)', color: 'var(--on-ink)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', boxShadow: '0 10px 24px rgba(0,0,0,.18)' }}
        >
          <Flame size={15} />
          {shown} d’affilée !
        </motion.span>
      )}
    </AnimatePresence>
  )
}

const BURST_COLORS = ['#ffc93d', '#d9622b', '#a898f5', '#5ccb8e', '#7cc0f0', '#ff9c86']

/** A one-shot burst of flat confetti from the top of the screen. */
function Burst({ active }: { active: boolean }) {
  const reduce = useReducedMotion()
  if (!active || reduce) return null
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '18%', width: 0, height: 0, zIndex: 30, pointerEvents: 'none' }}>
      {Array.from({ length: 22 }, (_, k) => {
        const angle = (k / 22) * Math.PI * 2 + (k % 3) * 0.3
        const dist = 110 + (k % 5) * 34
        const size = 7 + (k % 4) * 3
        return (
          <motion.span
            key={k}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
            animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist + 160, opacity: 0, scale: 1, rotate: (k % 2 ? 1 : -1) * 220 }}
            transition={{ duration: 1.3, ease: [0.2, 0.7, 0.4, 1] }}
            style={{ position: 'absolute', width: size, height: k % 3 === 0 ? size * 1.8 : size, borderRadius: k % 3 === 1 ? '50%' : 3, background: BURST_COLORS[k % BURST_COLORS.length] }}
          />
        )
      })}
    </div>
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
