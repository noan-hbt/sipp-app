import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Api, ApiError, updateTokens } from '../lib/api'
import { t } from '../lib/i18n'
import { play } from '../lib/sound'
import { track } from '../lib/telemetry'
import { Button } from './ui'

/** Profile › change the password: other devices are signed out, this one keeps going with fresh tokens. */
export function ChangePassword({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const change = useMutation({
    mutationFn: () => Api.changePassword(current, next),
    onSuccess: (tokens) => {
      updateTokens(tokens)
      play('complete')
      track('password_changed')
      setCurrent('')
      setNext('')
      setOpen(false)
    },
    onError: () => play('wrong'),
  })
  const error = change.error instanceof ApiError
    ? change.error.status === 403 ? t.profile.wrongPassword : change.error.status === 429 ? t.account.tooMany : t.account.changeFailed
    : t.account.changeFailed

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls="profile-change-password"
        onClick={() => {
          setOpen(!open)
          change.reset()
        }}
        style={{ border: 'none', background: 'transparent', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 600, padding: '12px 0' }}
      >
        {t.account.changePassword}
      </button>
      {change.isSuccess && !open && <p role="status" style={{ fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>{t.account.changed}</p>}
      {open && (
        <form
          id="profile-change-password"
          className="well"
          onSubmit={(e) => {
            e.preventDefault()
            if (current && next.length >= 8 && !change.isPending) change.mutate()
          }}
          style={{ borderRadius: 24, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <div className="field">
            <label htmlFor="pw-current" style={{ color: 'var(--muted)' }}>{t.account.currentPassword}</label>
            <input id="pw-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => { setCurrent(e.target.value); change.reset() }} />
          </div>
          <div className="field">
            <label htmlFor="pw-new" style={{ color: 'var(--muted)' }}>{t.account.newPassword}</label>
            <input id="pw-new" type="password" autoComplete="new-password" required minLength={8} placeholder={t.auth.passwordPlaceholder} value={next} onChange={(e) => { setNext(e.target.value); change.reset() }} />
            {next.length > 0 && next.length < 8 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.auth.charsLeft(8 - next.length)}</span>}
          </div>
          {change.isError && <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 14, fontWeight: 600 }}>{error}</p>}
          <Button type="submit" disabled={change.isPending || !current || next.length < 8} style={{ fontSize: 16 }}>
            {change.isPending ? t.account.changing : t.account.changeCta}
          </Button>
          <Button variant="ghost" type="button" onClick={() => { setOpen(false); setCurrent(''); setNext(''); change.reset() }} style={{ height: 44, fontSize: 15 }}>
            {t.common.cancel}
          </Button>
        </form>
      )}
    </>
  )
}
