import { motion } from 'motion/react'
import { useState } from 'react'
import { Button } from '../components/ui'
import { Api, ApiError, setTokens } from '../lib/api'
import { play } from '../lib/sound'
import { track } from '../lib/telemetry'
import { t } from '../lib/i18n'

/** Forgotten password: a 6-digit code by email, then a new password (which signs in). */
export function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      play('wrong')
      const e = err instanceof ApiError ? err : null
      setError(
        e?.code === 'invalid_code' ? t.forgot.wrongCode
          : e?.status === 429 ? t.forgot.tooMany
          : e?.status === 422 ? t.auth.invalid
          : t.auth.unreachable,
      )
    } finally {
      setBusy(false)
    }
  }

  const send = (e?: React.FormEvent) => {
    e?.preventDefault()
    void run(async () => {
      await Api.forgotPassword(email.trim())
      play('pop')
      setStep('code')
    })
  }
  const reset = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const tokens = await Api.resetPassword(email.trim(), code, password)
      play('complete')
      track('password_reset')
      setTokens(tokens)
    })
  }

  return (
    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {step === 'email' ? (
        <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.45, padding: '0 4px' }}>{t.forgot.body}</p>
          <div className="field">
            <label htmlFor="forgot-email">{t.auth.email}</label>
            <input id="forgot-email" type="email" autoComplete="email" inputMode="email" placeholder={t.auth.emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p role="alert" style={{ color: 'var(--rose-ink)', fontWeight: 600, fontSize: 15, textAlign: 'center' }}>{error}</p>}
          <Button type="submit" disabled={busy || !email.includes('@')} sound={null}>
            {busy ? '…' : t.forgot.send}
          </Button>
        </form>
      ) : (
        <motion.form initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={reset} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.45, padding: '0 4px' }}>{t.forgot.sent(email.trim())}</p>
          <div className="field">
            <label htmlFor="forgot-code">{t.forgot.code}</label>
            <input
              id="forgot-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                setError(null)
              }}
              style={{ letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>
          <div className="field">
            <label htmlFor="forgot-password">{t.forgot.newPassword}</label>
            <input id="forgot-password" type="password" autoComplete="new-password" placeholder={t.auth.passwordPlaceholder} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert" style={{ color: 'var(--rose-ink)', fontWeight: 600, fontSize: 15, textAlign: 'center' }}>{error}</p>}
          <Button type="submit" disabled={busy || code.length !== 6 || password.length < 8} sound={null}>
            {busy ? '…' : t.forgot.save}
          </Button>
          <button type="button" disabled={busy} onClick={() => send()} style={{ border: 'none', background: 'none', height: 40, fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>
            {t.forgot.resend}
          </button>
        </motion.form>
      )}
      <button type="button" onClick={onBack} style={{ border: 'none', background: 'none', height: 40, fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>
        {t.forgot.back}
      </button>
    </div>
  )
}
