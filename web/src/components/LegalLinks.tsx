import { Link } from 'react-router-dom'
import { LEGAL_SLUGS, type LegalSlug } from '../legal/docs'
import { t } from '../lib/i18n'

/** A quiet row of links to the legal pages. */
export function LegalLinks({ exclude, color = 'var(--muted)', center = false }: { exclude?: LegalSlug; color?: string; center?: boolean }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 16px', justifyContent: center ? 'center' : 'flex-start' }}>
      {LEGAL_SLUGS.filter((s) => s !== exclude).map((s) => (
        <li key={s}>
          <Link to={`/legal/${s}`} style={{ color, fontSize: 13, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, display: 'inline-block', padding: '6px 0' }}>
            {t.legal.links[s]}
          </Link>
        </li>
      ))}
    </ul>
  )
}
