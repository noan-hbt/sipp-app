import type { ReactNode } from 'react'

/** Colour families shared by every lesson block: a soft fill and the ink that reads on it. */
export const TONES = {
  peach: ['var(--peach-soft)', 'var(--peach-ink)'],
  lavender: ['var(--lavender)', 'var(--lavender-ink)'],
  mint: ['var(--mint)', 'var(--mint-ink)'],
  sky: ['var(--sky)', 'var(--sky-ink)'],
  butter: ['var(--butter)', 'var(--butter-ink)'],
  rose: ['var(--rose)', 'var(--rose-ink)'],
} as const
export type Tone = keyof typeof TONES

const path = (d: ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
)

export const KICKER_ICONS = {
  concept: path(<path d="M12 3l2.2 5.6L20 9.5l-4.4 3.9 1.3 5.8L12 16.2 7.1 19.2l1.3-5.8L4 9.5l5.8-.9z" />),
  example: path(<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  scenario: path(<path d="M20 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1120 12z" />),
  analogy: path(<><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></>),
  compare: path(<><rect x="3.5" y="4" width="7" height="16" rx="2" /><rect x="13.5" y="4" width="7" height="16" rx="2" /></>),
  steps: path(<><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 5l1.5-1v5M3.5 18.5h3l-3-3.2a1.4 1.4 0 012.4-1" /></>),
  cause: path(<><circle cx="6" cy="6" r="2.5" /><path d="M8 8l8 8" /><path d="M17 11v6h-6" /></>),
  code: path(<path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />),
  math: path(<path d="M18 5H7l6 7-6 7h11" />),
  question: path(<><path d="M9 9a3 3 0 115 2.2c-1.2.8-2 1.4-2 2.8" /><path d="M12 18h.01" /></>),
  myth: path(<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>),
  apply: path(<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z" />),
  recap: path(<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" /></>),
  fill: path(<><path d="M4 7h16M4 12h6M14 12h6M4 17h10" /></>),
  match: path(<><circle cx="6" cy="7" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M8.5 7H12a3 3 0 013 3v4a3 3 0 003 3" /></>),
  estimate: path(<><path d="M4 16a8 8 0 0116 0" /><path d="M12 16l3.5-4.5" /></>),
}

/** The small label above every block: an icon tile and a word, in the block's colour.
 *  `onTint` when the block itself is filled with the tone, so the tile turns white. */
export function Kicker({ icon, tone, onTint, children }: { icon: keyof typeof KICKER_ICONS; tone: Tone; onTint?: boolean; children: ReactNode }) {
  const [tint, ink] = TONES[tone]
  const bg = onTint ? 'color-mix(in srgb, var(--surface) 80%, transparent)' : tint
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: ink, fontSize: 13, fontWeight: 600 }}>
      <span style={{ width: 26, height: 26, borderRadius: 9, background: bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{KICKER_ICONS[icon]}</span>
      {children}
    </span>
  )
}
