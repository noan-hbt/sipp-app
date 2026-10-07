import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button, Icon, IconButton, Star } from '../components/ui'
import { Api, ApiError, type LessonBrief, type ModuleOut } from '../lib/api'
import { duration, LESSON_MINUTES } from '../lib/format'
import { haptic, play } from '../lib/sound'
import { DeleteButton } from './ProgramView'

const GAP = 104
const BANNER_GAP = 92
const TOP_PAD = 210
const BOTTOM_PAD = 120
const NODE = 68
const NODE_NOW = 86
const MASCOT = 50

const MODULE_COLORS = [
  ['var(--lavender)', 'var(--lavender-ink)'],
  ['var(--mint)', 'var(--mint-ink)'],
  ['var(--sky)', 'var(--sky-ink)'],
  ['var(--butter)', 'var(--butter-ink)'],
  ['var(--rose)', 'var(--rose-ink)'],
  ['var(--peach-soft)', 'var(--peach-ink)'],
]

interface Node {
  lesson: LessonBrief
  module: ModuleOut
  index: number
  x: number
  y: number
  firstOfModule: boolean
  state: 'done' | 'now' | 'locked'
}

function layout(modules: ModuleOut[], width: number) {
  const flat = modules.flatMap((m) => m.lessons.map((l, i) => ({ l, m, first: i === 0 })))
  const amp = Math.min(96, (width - 130) / 2)
  const cx = width / 2
  let acc = BOTTOM_PAD
  const fromBottom: number[] = []
  flat.forEach((f) => {
    if (f.first) acc += BANNER_GAP
    fromBottom.push(acc)
    acc += GAP
  })
  const height = acc - GAP + TOP_PAD
  const nowIdx = flat.findIndex((f) => !f.l.completed)
  const nodes: Node[] = flat.map((f, i) => ({
    lesson: f.l,
    module: f.m,
    index: i,
    x: cx + amp * Math.sin(i * 1.05 + 0.4),
    y: height - fromBottom[i],
    firstOfModule: f.first,
    state: nowIdx === -1 || i < nowIdx ? 'done' : i === nowIdx ? 'now' : 'locked',
  }))
  return { nodes, height, nowIdx }
}

function pathThrough(pts: { x: number; y: number }[]) {
  if (!pts.length) return ''
  let d = `M${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const my = (a.y + b.y) / 2
    d += ` C${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`
  }
  return d
}

export function SipMap() {
  const { sipId = '' } = useParams()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { completed?: string; fresh?: boolean } }
  const justCompleted = loc.state?.completed
  const fresh = loc.state?.fresh
  const scroller = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<'map' | 'list'>(() => {
    try {
      return sessionStorage.getItem('sipp.view') === 'list' ? 'list' : 'map'
    } catch {
      return 'map'
    }
  })
  const toggleView = () => {
    const v = view === 'map' ? 'list' : 'map'
    setView(v)
    try {
      sessionStorage.setItem('sipp.view', v)
    } catch {
      /* ignore */
    }
  }
  const [width, setWidth] = useState(() => Math.min(window.innerWidth, 480))
  const sip = useQuery({
    queryKey: ['sip', sipId],
    queryFn: () => Api.sip(sipId),
    refetchInterval: (q) => (q.state.data?.modules.some((m) => m.lessons.some((l) => l.status === 'queued' || l.status === 'generating')) ? 4000 : false),
  })

  useEffect(() => {
    const onResize = () => setWidth(Math.min(window.innerWidth, 480))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const qc = useQueryClient()
  const extend = useMutation({
    mutationFn: () => Api.extendSip(sipId),
    onSuccess: (p) => {
      play('whoosh')
      void qc.invalidateQueries({ queryKey: ['sip', sipId] })
      void qc.invalidateQueries({ queryKey: ['programs'] })
      nav(`/programs/${p.id}`)
    },
    onError: (e) => {
      // Already turned into a program (e.g. from another device): just open it.
      const pid = e instanceof ApiError ? (e.detail as { program_id?: string } | undefined)?.program_id : undefined
      if (pid) nav(`/programs/${pid}`)
      else play('wrong')
    },
  })
  const programId = sip.data?.program_id
  const remove = useMutation({
    mutationFn: () => Api.deleteSip(sipId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sips'] })
      void qc.invalidateQueries({ queryKey: ['programs'] })
      void qc.invalidateQueries({ queryKey: ['plan'] })
      nav(programId ? `/programs/${programId}` : '/library', { replace: true })
    },
  })
  const modules = useMemo(() => sip.data?.modules ?? [], [sip.data])
  const { nodes, height, nowIdx } = useMemo(() => layout(modules, width), [modules, width])
  const now = nodes[nowIdx]
  const totalStars = nodes.reduce((s, n) => s + (n.lesson.stars ?? 0), 0)
  const doneUpTo = nowIdx === -1 ? nodes.length - 1 : nowIdx

  const donePath = pathThrough(nodes.slice(0, Math.max(doneUpTo, 0)).map((n) => n))
  const lastSeg = doneUpTo > 0 ? pathThrough([nodes[doneUpTo - 1], nodes[doneUpTo]]) : ''
  const todoPath = pathThrough(nodes.slice(Math.max(doneUpTo, 0)))
  const fullPath = pathThrough(nodes)

  // Center the current lesson on open.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !nodes.length) return
    const target = (now ?? nodes[nodes.length - 1]).y - el.clientHeight * 0.55
    el.scrollTop = justCompleted && nowIdx > 0 ? nodes[nowIdx - 1].y - el.clientHeight * 0.55 : target
    if (justCompleted) {
      const t = setTimeout(() => el.scrollTo({ top: target, behavior: 'smooth' }), 350)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, width])

  useEffect(() => {
    if (!justCompleted || !now) return
    const t = setTimeout(() => {
      play('unlock')
      haptic(15)
    }, 1150)
    return () => clearTimeout(t)
  }, [justCompleted, now])

  return (
    <Screen>
      <AnimatePresence>
        {view === 'list' && sip.data && (
          <ProgramList
            key="list"
            modules={modules}
            nodes={nodes}
            summary={sip.data.summary}
            onOpen={(id) => nav(`/lessons/${id}`)}
            footer={
              <DeleteButton
                label={programId ? 'Supprimer ce chapitre' : 'Supprimer ce Sip'}
                confirm={programId ? 'Supprimer ce chapitre ? Tu pourras le régénérer depuis le programme (une génération).' : 'Supprimer ce Sip ? Ta progression sera perdue.'}
                busy={remove.isPending}
                onConfirm={() => remove.mutate()}
              />
            }
          />
        )}
      </AnimatePresence>
      <div ref={scroller} className="scroll" style={{ position: 'relative', visibility: view === 'list' ? 'hidden' : undefined }}>
        {sip.isLoading ? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
            <Mascot mood="think" size={90} />
          </div>
        ) : (
          <div style={{ position: 'relative', height, width: '100%' }}>
            <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
              <path d={fullPath} fill="none" stroke="#E2DCD2" strokeWidth="24" strokeLinecap="round" />
              <motion.path
                d={donePath}
                fill="none"
                stroke="var(--peach)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray="1 16"
                initial={fresh ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, ease: 'easeInOut' }}
              />
              <path d={todoPath} fill="none" stroke="#D3CCC1" strokeWidth="7" strokeLinecap="round" strokeDasharray="1 16" />
              {lastSeg && (
                <motion.path
                  d={lastSeg}
                  fill="none"
                  stroke="var(--peach)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="1 16"
                  initial={justCompleted ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.7, delay: 0.45, ease: 'easeInOut' }}
                />
              )}
            </svg>

            {nodes.map((n) =>
              n.firstOfModule ? <ModuleBanner key={`b${n.module.id}`} node={n} width={width} fresh={!!fresh} /> : null,
            )}

            {nodes.map((n) => (
              <MapNode
                key={n.lesson.id}
                node={n}
                width={width}
                appearDelay={fresh ? 0.2 + n.index * 0.05 : 0}
                unlocking={!!justCompleted && n.state === 'now'}
                onOpen={() => nav(`/lessons/${n.lesson.id}`)}
                lockedHint={now?.lesson.title}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {view === 'map' && nodes.length > 0 && nowIdx === -1 && (
          <motion.div
            key="finished"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26, delay: justCompleted ? 1.2 : 0.3 }}
            className="card"
            style={{ position: 'absolute', zIndex: 3, left: 16, right: 16, bottom: 'calc(var(--safe-bottom) + 16px)', borderRadius: 28, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Mascot mood="bravo" size={52} />
              <div>
                <span style={{ fontSize: 17, fontWeight: 900 }}>{programId ? 'Chapitre terminé !' : 'Sip terminé !'}</span>
                <p className="muted" style={{ fontSize: 14, fontWeight: 700 }}>
                  {programId ? 'La suite de ton programme t’attend.' : 'Envie d’aller plus loin sur ce sujet ?'}
                </p>
              </div>
            </div>
            {programId ? (
              <Button sound="pop" onClick={() => nav(`/programs/${programId}`)}>
                Voir la suite du programme
              </Button>
            ) : (
              <Button sound="pop" disabled={extend.isPending} onClick={() => extend.mutate()}>
                {extend.isPending ? <Mascot mood="think" size={30} /> : 'Aller plus loin'}
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <header style={{ position: 'absolute', zIndex: 2, left: 0, right: 0, top: 0, padding: 'calc(var(--safe-top) + 14px) 18px 22px', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(var(--bg) 72%, rgba(241,237,231,0))' }}>
        <IconButton label="Retour" onClick={() => nav(programId ? `/programs/${programId}` : '/')}>
          {Icon.back}
        </IconButton>
        <div className="card" style={{ flex: 1, minWidth: 0, height: 46, borderRadius: 23, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10 }}>
          <span style={{ fontWeight: 900, fontSize: 15, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sip.data?.chapter && <span style={{ color: 'var(--muted)' }}>Ch. {sip.data.chapter} · </span>}
            {sip.data?.title ?? ''}
          </span>
          <motion.span key={totalStars} initial={{ scale: 1.5 }} animate={{ scale: 1 }} style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 900, fontSize: 14 }}>
            <Star size={16} />
            {totalStars}
          </motion.span>
        </div>
        <IconButton label={view === 'map' ? 'Voir le programme' : 'Voir la carte'} onClick={toggleView}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={view}
              initial={{ scale: 0.4, rotate: -40, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0.4, rotate: 40, opacity: 0 }}
              transition={{ duration: 0.16 }}
              style={{ display: 'grid' }}
            >
              {view === 'map' ? Icon.list : Icon.map}
            </motion.span>
          </AnimatePresence>
        </IconButton>
      </header>
    </Screen>
  )
}

function ProgramList({
  modules,
  nodes,
  summary,
  onOpen,
  footer,
}: {
  modules: ModuleOut[]
  nodes: Node[]
  summary: string | null
  onOpen: (lessonId: string) => void
  footer?: ReactNode
}) {
  const byId = new Map(nodes.map((n) => [n.lesson.id, n]))
  return (
    <motion.div
      className="scroll"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        background: 'var(--bg)',
        padding: 'calc(var(--safe-top) + 88px) 20px 60px',
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 4px' }}>
        {[`${nodes.length} leçons`, duration(nodes.length), `${modules.length} module${modules.length > 1 ? 's' : ''}`].map((t) => (
          <span key={t} className="chip" style={{ background: 'var(--surface)', color: 'var(--ink-soft)', boxShadow: '0 0 0 1px rgba(43,38,32,.06)' }}>
            {t}
          </span>
        ))}
      </div>
      {summary && (
        <p className="muted" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, padding: '0 4px' }}>
          {summary}
        </p>
      )}
      {modules.map((m) => {
        const [bg, ink] = MODULE_COLORS[(m.position - 1) % MODULE_COLORS.length]
        const done = m.lessons.filter((l) => l.completed).length
        return (
          <section key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px' }}>
              <span className="chip" style={{ background: bg, color: ink, flexShrink: 0 }}>
                Module {m.position}
              </span>
              <h2 style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.3, flex: 1 }}>{m.title}</h2>
              <span className="muted" style={{ fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                {done}/{m.lessons.length} · {m.lessons.length * LESSON_MINUTES} min
              </span>
            </div>
            <div className="card" style={{ borderRadius: 24, padding: 6, display: 'flex', flexDirection: 'column' }}>
              {m.lessons.map((l) => {
                const n = byId.get(l.id)
                const state = n?.state ?? 'locked'
                const open = state !== 'locked'
                return (
                  <motion.button
                    key={l.id}
                    disabled={!open}
                    aria-label={open ? undefined : `${l.title} (verrouillée)`}
                    onClick={() => {
                      play('tap')
                      onOpen(l.id)
                    }}
                    whileTap={open ? { scale: 0.98 } : undefined}
                    style={{
                      border: 'none',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 18,
                      background: state === 'now' ? 'var(--peach-soft)' : 'transparent',
                      cursor: open ? 'pointer' : 'default',
                    }}
                  >
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        flexShrink: 0,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 14,
                        fontWeight: 900,
                        background: state === 'done' ? 'var(--mint)' : state === 'now' ? 'var(--peach)' : 'var(--track)',
                        color: state === 'done' ? 'var(--mint-ink)' : 'var(--ink)',
                      }}
                    >
                      {state === 'done' ? (
                        Icon.check(16)
                      ) : state === 'now' ? (
                        (n?.index ?? 0) + 1
                      ) : (
                        <span style={{ transform: 'scale(.75)', display: 'grid' }}>{Icon.lock}</span>
                      )}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3, color: open ? 'var(--ink)' : 'var(--muted)' }}>{l.title}</span>
                      <span className="muted" style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                        {l.objective}
                      </span>
                    </span>
                    {state === 'done' && (
                      <span style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                        {[1, 2, 3].map((i) => (
                          <Star key={i} size={12} filled={(l.stars ?? 0) >= i} />
                        ))}
                      </span>
                    )}
                  </motion.button>
                )
              })}
            </div>
          </section>
        )
      })}
      {footer}
    </motion.div>
  )
}

function ModuleBanner({ node, width, fresh }: { node: Node; width: number; fresh: boolean }) {
  const [bg, ink] = MODULE_COLORS[(node.module.position - 1) % MODULE_COLORS.length]
  const reached = node.state !== 'locked'
  return (
    <motion.div
      initial={fresh ? { opacity: 0, scale: 0.8 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: fresh ? 0.15 + node.index * 0.05 : 0 }}
      style={{ position: 'absolute', left: 0, width, top: node.y + 58, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}
    >
      <span
        className={reached ? undefined : 'well'}
        style={{
          maxWidth: width - 60,
          padding: '8px 16px',
          borderRadius: 18,
          background: reached ? bg : undefined,
          color: reached ? ink : 'var(--muted)',
          fontSize: 13,
          fontWeight: 900,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        Module {node.module.position} · {node.module.title}
      </span>
    </motion.div>
  )
}

function MapNode({
  node,
  width,
  appearDelay,
  unlocking,
  onOpen,
  lockedHint,
}: {
  node: Node
  width: number
  appearDelay: number
  unlocking: boolean
  onOpen: () => void
  lockedHint?: string
}) {
  const shake = useAnimationControls()
  const [hint, setHint] = useState(false)
  const size = node.state === 'now' ? NODE_NOW : NODE
  const left = node.x - size / 2
  const top = node.y - size / 2
  const spaceRight = width - (node.x + size / 2 + 16) - 12
  const spaceLeft = node.x - size / 2 - 16 - 12
  const bubbleRight = spaceRight >= spaceLeft
  const bubbleW = Math.min(200, Math.max(spaceRight, spaceLeft))
  const mascotLeft = Math.min(
    Math.max(4, bubbleRight ? node.x - size / 2 - MASCOT - 2 : node.x + size / 2 + 2),
    width - MASCOT - 4,
  )
  const preparing = node.lesson.status !== 'ready'

  const common = {
    position: 'absolute' as const,
    left,
    top,
    width: size,
    height: size,
    borderRadius: size / 2,
    border: 'none',
    display: 'grid',
    placeItems: 'center',
  }

  if (node.state === 'locked') {
    return (
      <>
        <motion.button
          aria-label={`${node.lesson.title} (verrouillée)`}
          className="inset"
          animate={shake}
          initial={appearDelay ? { scale: 0 } : false}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 400, damping: 18, delay: appearDelay }}
          onClick={() => {
            play('wrong')
            haptic(20)
            setHint(true)
            void shake.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.35 } })
            setTimeout(() => setHint(false), 1800)
          }}
          style={{ ...common, background: 'var(--bg)' }}
        >
          {Icon.lock}
        </motion.button>
        <AnimatePresence>
          {hint && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4 }}
              className="raised-sm"
              style={{ position: 'absolute', top: top - 54, left: Math.min(Math.max(12, node.x - 110), width - 232), width: 220, borderRadius: 16, padding: '8px 12px', fontSize: 13, fontWeight: 800, textAlign: 'center', zIndex: 5 }}
            >
              Termine d’abord « {lockedHint} »
            </motion.div>
          )}
        </AnimatePresence>
      </>
    )
  }

  if (node.state === 'done') {
    return (
      <>
        <motion.button
          aria-label={`${node.lesson.title}, terminée, ${node.lesson.stars ?? 0} étoiles`}
          initial={appearDelay ? { scale: 0 } : false}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 16, delay: appearDelay }}
          whileTap={{ scale: 0.9, y: 4 }}
          onClick={() => {
            play('tap')
            onOpen()
          }}
          style={{ ...common, background: 'var(--mint)', boxShadow: '0 6px 0 var(--mint-lip), 6px 10px 16px var(--shadow-dark), -6px -6px 14px var(--shadow-light)' }}
        >
          {Icon.check(26, '#2F7A52')}
        </motion.button>
        <div aria-hidden="true" style={{ position: 'absolute', left: node.x - 30, top: top + size + 6, width: 60, display: 'flex', justifyContent: 'center', gap: 2 }}>
          {[0, 1, 2].map((i) => (
            <Star key={i} size={15} filled={(node.lesson.stars ?? 0) > i} />
          ))}
        </div>
      </>
    )
  }

  // current lesson
  return (
    <>
      <motion.div
        aria-hidden="true"
        style={{ position: 'absolute', left: mascotLeft, top: node.y - 34, pointerEvents: 'none' }}
        initial={{ opacity: 0, x: bubbleRight ? 12 : -12, scale: 0.6 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 16, delay: unlocking ? 1.25 : 0.3 }}
      >
        <Mascot mood={unlocking ? 'bravo' : 'hello'} size={MASCOT} />
      </motion.div>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: node.x - (size + 16) / 2,
          top: node.y + 3.5 - (size + 16) / 2,
          width: size + 16,
          height: size + 16,
          borderRadius: '50%',
          background: 'var(--peach)',
          opacity: 0,
          animation: 'halo 2s ease-out infinite',
        }}
      />
      <motion.button
        aria-label={`Commencer : ${node.lesson.title}`}
        initial={unlocking ? { scale: 0, rotate: -30 } : appearDelay ? { scale: 0 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 12, delay: unlocking ? 1.1 : appearDelay }}
        whileTap={{ scale: 0.92, y: 6 }}
        onClick={() => {
          play('pop')
          haptic()
          onOpen()
        }}
        style={{ ...common, background: 'var(--peach)', boxShadow: '0 7px 0 var(--peach-lip), 8px 14px 22px #D3CBBF, -6px -6px 14px var(--shadow-light)' }}
      >
        {Icon.play}
      </motion.button>
      <motion.button
        onClick={() => {
          play('tap')
          onOpen()
        }}
        initial={{ opacity: 0, x: bubbleRight ? -14 : 14, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20, delay: unlocking ? 1.35 : 0.35 }}
        className="raised"
        style={{
          position: 'absolute',
          top: node.y - 38,
          left: bubbleRight ? node.x + size / 2 + 16 : node.x - size / 2 - 16 - bubbleW,
          width: bubbleW,
          border: 'none',
          borderRadius: 22,
          padding: '12px 14px',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 900, color: '#B5582A', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Leçon {node.index + 1} · {preparing ? 'je la prépare' : '5 min'}
        </span>
        <span style={{ fontWeight: 900, fontSize: 15, lineHeight: 1.25 }}>{node.lesson.title}</span>
      </motion.button>
    </>
  )
}
