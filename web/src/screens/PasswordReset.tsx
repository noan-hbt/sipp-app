import { useMutation } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { RevealLines } from '../components/motion'
import { Screen } from '../components/Screen'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, ApiError, setTokens } from '../lib/api'
import { t } from '../lib/i18n'
import { play } from '../lib/sound'
import { track } from '../lib/telemetry'
import { useBack } from '../lib/useBack'

function Title({ lines }: { lines: [string, string] }) {
  return (
    <h1 className="display" style={{ fontSize: 36, lineHeight: 1, letterSpacing: '-0.05em' }}>
      <RevealLines lines={[{ text: lines[0] }, { text: lines[1], color: 'var(--primary)' }]} />
    </h1>
  )
}

function errorText(error: unknown) {
  if (error instanceof ApiError && error.status === 429) return t.account.tooMany
  if (error instanceof ApiError && error.status === 422) return t.auth.invalid
  return t.auth.unreachable
}

const column = { padding: '8px 20px 32px', display: 'flex', flexDirection: 'column' as const, gap: 18 }

/** "Mot de passe oublié": asks for the email, then says to check the inbox (same answer whether the account exists or not). */
export function ForgotPassword() {
  const back = useBack()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const send = useMutation({
    mutationFn: () => Api.forgotPassword(email.trim()),
    onSuccess: () => {
      play('complete')
      track('password_reset_requested')
    },
    onError: () => play('wrong'),
  })

  return (
    <Screen>
      <header className="topbar">
        <IconButton label={t.common.back} onClick={back}>{Icon.back}</IconButton>
      </header>
      <div className="scroll" style={column}>
        <Mascot mood={send.isSuccess ? 'bravo' : 'think'} size={96} />
        {send.isSuccess ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} role="status">
            <h1 className="title-l">{t.account.sentTitle}</h1>
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>{t.account.sentBody(email.trim())}</p>
            <Link to="/login" replace style={{ fontWeight: 700, color: 'var(--primary)', padding: '8px 0' }}>{t.account.backToLogin}</Link>
          </motion.div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (email.trim() && !send.isPending) send.mutate()
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <Title lines={t.account.forgotTitle} />
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>{t.account.forgotBody}</p>
            <div className="field">
              <label htmlFor="forgot-email">{t.auth.email}</label>
              <input id="forgot-email" type="email" autoComplete="email" inputMode="email" required placeholder={t.auth.emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {send.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontWeight: 600, fontSize: 15 }}>{errorText(send.error)}</p>}
            <Button type="submit" disabled={send.isPending || !email.trim()} sound={null}>
              {send.isPending ? '…' : t.account.forgotCta}
            </Button>
          </form>
        )}
      </div>
    </Screen>
  )
}

/** The page the emailed link opens: a new password, then the learner is signed in on this device. */
export function ResetPassword() {
  const nav = useNavigate()
  const back = useBack()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const reset = useMutation({
    mutationFn: () => Api.resetPassword(token, password),
    onSuccess: (tokens) => {
      play('complete')
      track('password_reset')
      setTokens(tokens)
      nav('/', { replace: true })
    },
    onError: () => play('wrong'),
  })
  const invalid = !token || (reset.error instanceof ApiError && reset.error.status === 400)

  return (
    <Screen>
      <header className="topbar">
        <IconButton label={t.common.back} onClick={back}>{Icon.back}</IconButton>
      </header>
      <div className="scroll" style={column}>
        <Mascot mood={invalid ? 'oops' : 'hello'} size={96} />
        {invalid ? (
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.45 }}>{t.account.resetInvalid}</p>
            <Button onClick={() => nav('/forgot-password', { replace: true })}>{t.account.newLink}</Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (password.length >= 8 && !reset.isPending) reset.mutate()
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <Title lines={t.account.resetTitle} />
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>{t.account.resetBody}</p>
            <div className="field">
              <label htmlFor="reset-password">{t.account.newPassword}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  id="reset-password"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder={t.auth.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button
                  type="button"
                  aria-label={show ? t.auth.hidePassword : t.auth.showPassword}
                  aria-pressed={show}
                  onClick={() => setShow((v) => !v)}
                  style={{ border: 'none', background: 'none', padding: 4, margin: -4, color: 'var(--muted)', display: 'grid', placeItems: 'center' }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                    {show && <path d="M4 4l16 16" />}
                  </svg>
                </button>
              </div>
              {password.length > 0 && password.length < 8 && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.auth.charsLeft(8 - password.length)}</span>
              )}
            </div>
            {reset.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontWeight: 600, fontSize: 15 }}>{errorText(reset.error)}</p>}
            <Button type="submit" disabled={reset.isPending || password.length < 8} sound={null}>
              {reset.isPending ? '…' : t.account.resetCta}
            </Button>
          </form>
        )}
      </div>
    </Screen>
  )
}
