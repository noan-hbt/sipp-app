import { useEffect } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { LegalLinks } from '../components/LegalLinks'
import { Screen } from '../components/Screen'
import { Icon, IconButton } from '../components/ui'
import { LEGAL_UPDATED } from '../legal/company'
import { en, fr, LEGAL_SLUGS, type LegalSlug } from '../legal/docs'
import { lang, locale, t } from '../lib/i18n'
import { useBack } from '../lib/useBack'

const DOCS = lang === 'fr' ? fr : en

/** Terms, privacy, refunds and legal notice: readable signed in or not, linked from sign-up, offers and the profile. */
export function Legal() {
  const { slug } = useParams()
  const back = useBack()
  const doc = LEGAL_SLUGS.includes(slug as LegalSlug) ? DOCS[slug as LegalSlug] : null
  useEffect(() => {
    if (!doc) return
    const previous = document.title
    document.title = `${doc.title} · Sipp`
    return () => {
      document.title = previous
    }
  }, [doc])
  if (!doc) return <Navigate to="/legal/terms" replace />
  const updated = new Date(`${LEGAL_UPDATED}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Screen width="regular">
      <header className="topbar">
        <IconButton label={t.common.back} onClick={back}>
          {Icon.back}
        </IconButton>
      </header>
      <article className="scroll legal" style={{ padding: '4px 22px 48px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 className="title-l">{doc.title}</h1>
        <p className="muted" style={{ fontSize: 13 }}>{t.legal.updated(updated)}</p>
        {doc.intro && <p style={{ fontSize: 16, lineHeight: 1.55 }}>{doc.intro}</p>}
        {doc.sections.map((s) => (
          <section key={s.title} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <h2 className="title-m" style={{ fontSize: 18 }}>{s.title}</h2>
            {s.body.map((p, i) => (
              <p key={i} style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-soft)', overflowWrap: 'anywhere' }}>{p}</p>
            ))}
          </section>
        ))}
        <nav aria-label={t.legal.other} style={{ marginTop: 24, paddingTop: 16, borderTop: '1.5px solid var(--bg-deep)' }}>
          <LegalLinks exclude={slug as LegalSlug} />
        </nav>
      </article>
    </Screen>
  )
}
