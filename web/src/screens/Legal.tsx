import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { Icon, IconButton } from '../components/ui'
import { EDITOR, LEGAL_UPDATED } from '../legal/editor'
import { LEGAL_EN } from '../legal/en'
import { LEGAL_FR } from '../legal/fr'
import type { LegalPageKey } from '../legal/types'
import { lang, locale, t } from '../lib/i18n'

const PAGES: LegalPageKey[] = ['mentions', 'privacy', 'terms']

/** A paragraph with its {placeholders} filled from EDITOR; an empty one shows, highlighted, that it is still to fill. */
function Filled({ text }: { text: string }) {
  const parts = text.split(/(\{\w+\})/)
  return (
    <>
      {parts.map((part, i) => {
        const key = part.match(/^\{(\w+)\}$/)?.[1] as keyof typeof EDITOR | undefined
        if (!key) return part
        const value = EDITOR[key]
        return value ? value : <mark key={i} style={{ background: 'var(--butter)', color: 'var(--butter-ink)', borderRadius: 4, padding: '0 3px' }}>{t.legal.missing}</mark>
      })}
    </>
  )
}

/** Legal notice, privacy policy and terms: readable without an account, in the app's language. */
export function Legal() {
  const nav = useNavigate()
  const { page = '' } = useParams()
  if (!PAGES.includes(page as LegalPageKey)) return <Navigate to="/legal/privacy" replace />
  const key = page as LegalPageKey
  const doc = (lang === 'fr' ? LEGAL_FR : LEGAL_EN)[key]
  const updated = new Date(`${LEGAL_UPDATED}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <Screen>
      <header className="topbar">
        <IconButton label={t.common.back} onClick={() => (window.history.length > 1 ? nav(-1) : nav('/', { replace: true }))}>
          {Icon.back}
        </IconButton>
      </header>
      <article className="scroll" style={{ padding: '4px 22px 48px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="display" style={{ fontSize: 32, lineHeight: 1.02, letterSpacing: '-0.04em' }}>{doc.title}</h1>
          <span className="muted" style={{ fontSize: 13 }}>{t.legal.updated(updated)}</span>
        </div>
        {doc.intro && <p style={{ fontSize: 16, lineHeight: 1.5 }}>{doc.intro}</p>}
        {doc.sections.map((s) => (
          <section key={s.title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>{s.title}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="lx-p" style={{ fontSize: 15, lineHeight: 1.55 }}>
                <Filled text={p} />
              </p>
            ))}
          </section>
        ))}
        <LegalLinks except={key} />
      </article>
    </Screen>
  )
}

/** The three legal pages as small links, for footers. */
export function LegalLinks({ except, style }: { except?: LegalPageKey; style?: React.CSSProperties }) {
  return (
    <nav aria-label={t.legal.nav} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 14px', fontSize: 13, ...style }}>
      {PAGES.filter((p) => p !== except).map((p) => (
        <Link key={p} to={`/legal/${p}`} style={{ color: 'var(--muted)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
          {t.legal.links[p]}
        </Link>
      ))}
    </nav>
  )
}
