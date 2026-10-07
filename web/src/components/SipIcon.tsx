const PALETTES = [
  { bg: 'var(--peach-soft)', ink: '#B5582A', bar: 'var(--peach)' },
  { bg: 'var(--lavender)', ink: '#5A45A8', bar: 'var(--lavender-strong)' },
  { bg: 'var(--mint)', ink: '#2F7A52', bar: 'var(--mint-strong)' },
  { bg: 'var(--sky)', ink: '#2D6496', bar: '#8DB8E0' },
  { bg: 'var(--butter)', ink: '#8A6A12', bar: '#E2C766' },
  { bg: 'var(--rose)', ink: '#A33A52', bar: '#E79AAA' },
]

const GLYPHS = [
  'M4 18l5-6 4 3 7-9M15 6h5v5',
  'M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z',
  'M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0012 3z',
  'M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5zM4 19.5A2.5 2.5 0 006.5 22H20v-5',
  'M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',
  'M8 6l-6 6 6 6M16 6l6 6-6 6',
  'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6',
  'M12 22c4-3 7-7 7-12a7 7 0 00-14 0c0 5 3 9 7 12zM12 13a3 3 0 100-6 3 3 0 000 6z',
]

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function sipPalette(id: string) {
  return PALETTES[hash(id) % PALETTES.length]
}

/** Notion-like pastel page icon, deterministic per Sip. */
export function SipIcon({ id, size = 48 }: { id: string; size?: number }) {
  const p = sipPalette(id)
  const glyph = GLYPHS[hash(id + 'g') % GLYPHS.length]
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.36,
        background: p.bg,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={size / 2} height={size / 2} viewBox="0 0 24 24" fill="none" stroke={p.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={glyph} />
      </svg>
    </span>
  )
}
