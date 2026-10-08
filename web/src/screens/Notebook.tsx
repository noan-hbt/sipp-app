import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RichText } from '../components/RichText'
import { illustration } from '../components/SipIcon'
import { Api, type Concept } from '../lib/api'
import { play } from '../lib/sound'

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Three dots: how well a notion is learned (1 fragile → 3 well learned). */
export function Mastery({ level }: { level: number }) {
  const on = level >= 3 ? 'var(--mint-lip)' : 'var(--primary)'
  return (
    <span aria-label={`Maîtrise : ${level} sur 3`} role="img" style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
      {[1, 2, 3].map((i) => (
        <span key={i} style={{ width: 8, height: 8, borderRadius: 4, background: i <= level ? on : 'var(--line-strong)' }} />
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

  if (concepts.isLoading) return <div className="scroll" />

  if (!all.length) {
    return (
      <div className="scroll" style={{ padding: '40px 32px 130px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
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
      {dueTotal > 0 && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            play('pop')
            nav('/review')
          }}
          style={{ border: 'none', borderRadius: 22, padding: '12px 14px', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
        >
          <span style={{ width: 40, height: 40, borderRadius: 14, background: 'rgba(255,255,255,.2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
            </svg>
          </span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Réviser maintenant</span>
            <span style={{ fontSize: 13, opacity: 0.9 }}>
              {dueTotal} notion{dueTotal > 1 ? 's' : ''} à rafraîchir · 2 min
            </span>
          </span>
        </motion.button>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, height: 48, padding: '0 14px', borderRadius: 16, background: 'var(--surface)', boxShadow: 'inset 0 0 0 2px var(--line)' }}>
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
        <div style={{ display: 'flex', gap: 6, margin: '0 -16px', padding: '0 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {[[null, 'Tout'] as const, ...sips].map(([id, title]) => (
            <button
              key={id ?? 'all'}
              onClick={() => {
                play('tap')
                setSip(id)
              }}
              aria-pressed={sip === id}
              style={{ height: 34, padding: '0 13px', borderRadius: 17, border: 'none', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, background: sip === id ? 'var(--ink)' : 'var(--surface)', color: sip === id ? '#fff' : 'var(--ink-soft)' }}
            >
              {title}
            </button>
          ))}
        </div>
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
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '6px 4px 0' }}>{title}</h2>
      <div style={{ borderRadius: 22, background: 'var(--surface)', overflow: 'hidden' }}>{items.map(render)}</div>
    </section>
  )
}

function NotionRow({ c, open, onToggle, onLesson }: { c: Concept; open: boolean; onToggle: () => void; onLesson: () => void }) {
  return (
    <div style={{ borderTop: '1.5px solid var(--bg-deep)', marginTop: -1.5 }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{ width: '100%', minHeight: 54, border: 'none', background: 'transparent', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}
      >
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            <RichText text={c.name} />
          </span>
          {!open && (
            <span style={{ fontSize: 14, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <RichText text={c.definition} />
            </span>
          )}
        </span>
        <Mastery level={c.mastery} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="lx-lead" style={{ background: 'var(--peach-soft)', borderRadius: 16, padding: '10px 12px', fontSize: 16 }}>
                <RichText text={c.definition} />
              </p>
              {c.explanation && (
                <p className="lx-p" style={{ fontSize: 15 }}>
                  <RichText text={c.explanation} />
                </p>
              )}
              <button
                onClick={onLesson}
                style={{ alignSelf: 'flex-start', border: 'none', background: 'var(--bg-deep)', borderRadius: 14, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)', textAlign: 'left' }}
              >
                {c.sip_title} · {c.lesson_title} →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
