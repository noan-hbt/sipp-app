import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { RichText } from '../components/RichText'
import { illustration, sipPalette } from '../components/SipIcon'
import { Api, type Concept } from '../lib/api'
import { play } from '../lib/sound'
import { HScroll } from '../components/HScroll'

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Three strokes: how well a notion is learned (1 fragile → 3 well learned). */
export function Mastery({ level, color = 'var(--primary)' }: { level: number; color?: string }) {
  return (
    <span aria-label={`Maîtrise : ${level} sur 3`} role="img" style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
      {[1, 2, 3].map((i) => (
        <span key={i} style={{ width: 16, height: 5, borderRadius: 3, background: color, opacity: i <= level ? 1 : 0.22 }} />
      ))}
    </span>
  )
}

/** Every notion met in a finished lesson: search, filter by Sip, open one to read it again. */
export function Notebook() {
  const nav = useNavigate()
  const concepts = useQuery({ queryKey: ['concepts'], queryFn: Api.concepts })
  const [query, setQuery] = useState('')
  const [sip, setSip] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const all = useMemo(() => concepts.data ?? [], [concepts.data])
  const sips = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of all) if (!seen.has(c.sip_id)) seen.set(c.sip_id, c.sip_title)
    return [...seen]
  }, [all])
  const q = fold(query.trim())
  const shown = all.filter((c) => (!sip || c.sip_id === sip) && (!q || fold(c.name).includes(q) || fold(c.definition).includes(q)))
  const due = shown.filter((c) => c.due)
  const growing = shown.filter((c) => !c.due && c.mastery < 3)
  const solid = shown.filter((c) => !c.due && c.mastery >= 3)
  const dueTotal = all.filter((c) => c.due).length
  const error = (concepts.isError || concepts.isPaused) && <ErrorNotice message={concepts.isPaused ? 'Tu es hors ligne. Reconnecte-toi pour actualiser ton carnet.' : 'Impossible d’actualiser ton carnet. Réessaie.'} retry={() => { void concepts.refetch() }} busy={concepts.isFetching} />

  if (!concepts.data) return <div className="scroll" style={{ padding: '12px 16px 130px' }}>{error || <p className="muted" role="status">Chargement de ton carnet…</p>}</div>

  if (!all.length) {
    return (
      <div className="scroll" style={{ padding: '40px 32px 130px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        {error}
        <img src={illustration('scene-empty')} alt="" width={160} height={160} />
        <span className="display" style={{ fontSize: 21 }}>
          Ton carnet est vide
        </span>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
          Chaque notion que tu découvres dans une leçon vient se ranger ici, pour la relire et la réviser.
        </p>
      </div>
    )
  }

  const row = (c: Concept) => (
    <NotionRow
      key={c.id}
      c={c}
      open={open === c.id}
      onToggle={() => {
        play('tap')
        setOpen((o) => (o === c.id ? null : c.id))
      }}
      onLesson={() => nav(`/lessons/${c.lesson_id}`)}
    />
  )

  return (
    <div className="scroll" style={{ padding: '12px 16px 130px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error}
      {dueTotal > 0 && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            play('pop')
            nav('/review')
          }}
          style={{ flexShrink: 0, border: 'none', borderRadius: 24, padding: '14px 16px', background: 'var(--dock)', color: 'var(--dock-ink)', boxShadow: 'inset 0 0 0 1px var(--dock-line)', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
        >
          <span style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
            </svg>
          </span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Réviser maintenant</span>
            <span style={{ fontSize: 13, color: 'var(--dock-muted)' }}>
              {dueTotal} notion{dueTotal > 1 ? 's' : ''} à rafraîchir · 2 min
            </span>
          </span>
        </motion.button>
      )}

      <label className="field-pill" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 16px', borderRadius: 25, background: 'var(--surface)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Chercher parmi ${all.length} notion${all.length > 1 ? 's' : ''}`}
          aria-label="Chercher une notion"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, minWidth: 0 }}
        />
      </label>

      {sips.length > 1 && (
        <HScroll style={{ display: 'flex', gap: 6, margin: '0 -16px', padding: '0 16px' }}>
          {[[null, 'Tout'] as const, ...sips].map(([id, title]) => (
            <button
              key={id ?? 'all'}
              onClick={() => {
                play('tap')
                setSip(id)
              }}
              aria-pressed={sip === id}
              style={{ height: 36, padding: '0 14px', borderRadius: 18, border: 'none', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700, background: sip === id ? 'var(--ink)' : 'var(--surface)', color: sip === id ? 'var(--on-ink)' : 'var(--ink-soft)' }}
            >
              {title}
            </button>
          ))}
        </HScroll>
      )}

      {!shown.length && (
        <p className="muted" style={{ textAlign: 'center', padding: '20px 0', fontSize: 15 }}>
          Aucune notion ne correspond.
        </p>
      )}
      <Section title="À revoir bientôt" items={due} render={row} />
      <Section title="En train de s’installer" items={growing} render={row} />
      <Section title="Bien acquises" items={solid} render={row} />
    </div>
  )
}

function Section({ title, items, render }: { title: string; items: Concept[]; render: (c: Concept) => React.ReactNode }) {
  if (!items.length) return null
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 className="display" style={{ fontSize: 19, margin: '8px 4px 0', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {title}
        <span style={{ fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700, color: 'var(--faint)', letterSpacing: 0 }}>{items.length}</span>
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, gridAutoFlow: 'row dense' }}>{items.map(render)}</div>
    </section>
  )
}

/** A notion as a tile in its Sip's colour; open, it takes the full width with the definition and a way back to its lesson. */
function NotionRow({ c, open, onToggle, onLesson }: { c: Concept; open: boolean; onToggle: () => void; onLesson: () => void }) {
  const pal = sipPalette(c.sip_title)
  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 380, damping: 32 }} style={{ gridColumn: open ? '1 / -1' : undefined, borderRadius: 24, background: pal.bg, overflow: 'hidden' }}>
      <motion.button
        layout="position"
        onClick={onToggle}
        aria-expanded={open}
        whileTap={{ scale: 0.97 }}
        style={{ width: '100%', minHeight: open ? 0 : 128, border: 'none', background: 'transparent', padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6, textAlign: 'left', color: 'var(--ink)' }}
      >
        <span style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <span className="display" style={{ fontSize: open ? 22 : 17, lineHeight: 1.1, letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}>
            <RichText text={c.name} />
          </span>
          {open && <Mastery level={c.mastery} color={pal.ink} />}
        </span>
        {!open && (
          <>
            <span style={{ fontSize: 13, lineHeight: 1.35, color: pal.ink, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
              <RichText text={c.definition} />
            </span>
            <span style={{ marginTop: 'auto', paddingTop: 4 }}>
              <Mastery level={c.mastery} color={pal.ink} />
            </span>
          </>
        )}
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.08 }}>
            <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="lx-lead" style={{ background: 'var(--surface)', borderRadius: 18, padding: '12px 14px', fontSize: 16 }}>
                <RichText text={c.definition} />
              </p>
              {c.explanation && (
                <p className="lx-p" style={{ fontSize: 15 }}>
                  <RichText text={c.explanation} />
                </p>
              )}
              <button
                onClick={onLesson}
                style={{ alignSelf: 'flex-start', border: 'none', background: 'var(--frost)', borderRadius: 16, padding: '9px 12px', fontSize: 13, fontWeight: 700, color: pal.ink, textAlign: 'left' }}
              >
                {c.sip_title} · {c.lesson_title} →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
