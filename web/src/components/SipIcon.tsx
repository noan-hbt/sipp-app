import type { ReactNode } from 'react'

const PALETTES = [
  { bg: 'var(--peach-soft)', ink: '#B5582A', bar: 'var(--peach)' },
  { bg: 'var(--lavender)', ink: '#5A45A8', bar: 'var(--lavender-strong)' },
  { bg: 'var(--mint)', ink: '#2F7A52', bar: 'var(--mint-strong)' },
  { bg: 'var(--sky)', ink: '#2D6496', bar: '#8DB8E0' },
  { bg: 'var(--butter)', ink: '#8A6A12', bar: '#E2C766' },
  { bg: 'var(--rose)', ink: '#A33A52', bar: '#E79AAA' },
]

type P = (typeof PALETTES)[number]
const GLOSS = { stroke: '#FFF', strokeOpacity: 0.5, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' } as const

/** Each Sip is a drink: flat two-tone illustrations, same family as the cup mascot. */
const DRINKS: ((p: P) => ReactNode)[] = [
  // mug + steam
  (p) => (
    <>
      <path d="M15 4.5c-1.6 1.8 1.6 3 0 5M21 4.5c-1.6 1.8 1.6 3 0 5" stroke={p.ink} strokeOpacity=".45" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M27.5 17h1.8a4.2 4.2 0 010 8.4h-1.8" stroke={p.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M8 14h20v13a7 7 0 01-7 7h-6a7 7 0 01-7-7z" fill={p.bar} />
      <ellipse cx="18" cy="14" rx="10" ry="2.6" fill={p.ink} />
      <path d="M11.5 19v6.5c0 1.6.5 3 1.3 4" {...GLOSS} />
    </>
  ),
  // bubble tea
  (p) => (
    <>
      <path d="M22 11l3.5-8" stroke={p.ink} strokeWidth="2.8" strokeLinecap="round" />
      <path d="M11 13h18l-2.1 19.4a3 3 0 01-3 2.6h-7.8a3 3 0 01-3-2.6z" fill={p.bar} />
      <rect x="9.5" y="10" width="21" height="4" rx="2" fill={p.ink} />
      {[
        [16, 31],
        [20, 30.2],
        [24, 31],
        [18, 27],
        [22.2, 27.2],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.8" fill={p.ink} />
      ))}
      <path d="M14.5 17.5l.8 7" {...GLOSS} />
    </>
  ),
  // teacup + saucer
  (p) => (
    <>
      <ellipse cx="19" cy="31.5" rx="14" ry="3" fill={p.ink} opacity=".35" />
      <path d="M28.5 19.5h1.2a3.6 3.6 0 010 7.2h-2.4" stroke={p.ink} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M7.5 17h23v1.5c0 7-5.2 12-11.5 12S7.5 25.5 7.5 18.5z" fill={p.bar} />
      <ellipse cx="19" cy="17" rx="11.5" ry="2.4" fill={p.ink} />
      <path d="M21 17V9.5" stroke={p.ink} strokeWidth="1.4" />
      <rect x="18.6" y="5" width="4.8" height="5" rx="1.2" fill={p.ink} />
      <path d="M11 21.5c.4 2.4 1.5 4.2 3.2 5.4" {...GLOSS} />
    </>
  ),
  // takeaway cup with sleeve
  (p) => (
    <>
      <path d="M12 13.5h16l-1.9 19.5a2.5 2.5 0 01-2.5 2.2h-7.2a2.5 2.5 0 01-2.5-2.2z" fill={p.bar} />
      <path d="M12.7 20h14.6l-.7 7.5H13.4z" fill={p.ink} />
      <path d="M13 8.5h14l1.5 5h-17z" fill={p.ink} />
      <rect x="10" y="12" width="20" height="3" rx="1.5" fill={p.ink} />
      <path d="M15 29.5l.3 3" {...GLOSS} />
    </>
  ),
  // juice glass + straw + citrus slice
  (p) => (
    <>
      <path d="M23 14l4.5-10" stroke={p.ink} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11 10h18l-1.8 22.4a2.6 2.6 0 01-2.6 2.4h-9.2a2.6 2.6 0 01-2.6-2.4z" fill="#FFF" opacity=".55" />
      <path d="M11.6 17h16.8l-1.2 15.4a2.6 2.6 0 01-2.6 2.4h-9.2a2.6 2.6 0 01-2.6-2.4z" fill={p.bar} />
      <circle cx="11" cy="10.5" r="5" fill={p.ink} />
      <circle cx="11" cy="10.5" r="3.4" fill={p.bar} />
      <path d="M11 7.4v6.2M8 10.5h6" stroke={p.ink} strokeWidth="1" />
      <path d="M14.8 21l.6 8" {...GLOSS} />
    </>
  ),
  // bowl (matcha / latte bowl)
  (p) => (
    <>
      <path d="M14 7c-1.6 1.8 1.6 3 0 5M20 5.5c-1.6 1.8 1.6 3 0 5M26 7c-1.6 1.8 1.6 3 0 5" stroke={p.ink} strokeOpacity=".45" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M5 17h30c0 8.5-6.7 15-15 15S5 25.5 5 17z" fill={p.bar} />
      <rect x="14" y="31" width="12" height="3.5" rx="1.75" fill={p.ink} />
      <ellipse cx="20" cy="17" rx="15" ry="3" fill={p.ink} />
      <path d="M9.5 21.5c.8 2.8 2.4 4.8 4.6 6.2" {...GLOSS} />
    </>
  ),
]

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function sipPalette(id: string) {
  return PALETTES[hash(id) % PALETTES.length]
}

/** Pastel tile with a little drink illustration, deterministic per Sip. */
export function SipIcon({ id, size = 48 }: { id: string; size?: number }) {
  const p = sipPalette(id)
  const drink = DRINKS[hash(id + 'g') % DRINKS.length]
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.36,
        background: p.bg,
        boxShadow: 'inset 2px 2px 4px rgba(255,255,255,.55), inset -2px -3px 6px rgba(43,38,32,.06)',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 40 40" aria-hidden="true">
        {drink(p)}
      </svg>
    </span>
  )
}
