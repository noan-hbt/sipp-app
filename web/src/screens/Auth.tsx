import { motion, useAnimationControls } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { RevealLines } from '../components/motion'
import { Button, Icon } from '../components/ui'
import { Api, ApiError, setTokens } from '../lib/api'
import { play } from '../lib/sound'
import { track } from '../lib/telemetry'

export function Auth({ initial = 'register' }: { initial?: 'login' | 'register' }) {
  const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>(initial)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const shake = useAnimationControls()

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const t = mode === 'login' ? await Api.login(email.trim(), password) : await Api.register(email.trim(), password)
      play('complete')
      setTokens(t)
      track(mode === 'login' ? 'logged_in' : 'signed_up')
    } catch (err) {
      play('wrong')
      const status = err instanceof ApiError ? err.status : 0
      setError(
        status === 401
          ? 'Email ou mot de passe incorrect.'
          : status === 409
            ? 'Ce compte existe déjà, connecte-toi.'
            : status === 422
              ? 'Vérifie ton email, et 8 caractères minimum pour le mot de passe.'
              : 'Impossible de joindre Sipp. Réessaie.',
      )
      void shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <div className="scroll" style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
        <div style={{ position: 'relative', flexShrink: 0, height: 'calc(var(--safe-top) + 230px)', borderRadius: '0 0 40px 40px', background: '#d9622b', overflow: 'hidden' }}>
          <motion.span
            initial={{ scale: 0.3 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 120, damping: 16 }}
            style={{ position: 'absolute', left: '50%', bottom: -70, width: 260, height: 260, marginLeft: -130, borderRadius: 130, background: '#e5763f' }}
          />
          {[
            { bg: '#ece8ff', left: '8%', bottom: 34, rot: -12 },
            { bg: '#d9f3e4', right: '8%', bottom: 46, rot: 10 },
            { bg: '#fff0c2', right: '22%', bottom: 150, rot: -6, small: true },
          ].map((c, i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
              animate={{ opacity: 1, scale: 1, rotate: c.rot }}
              transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.1 + i * 0.08 }}
              style={{ position: 'absolute', left: c.left, right: c.right, bottom: c.bottom, width: c.small ? 46 : 78, height: c.small ? 46 : 90, borderRadius: c.small ? 14 : 22, background: c.bg }}
            />
          ))}
          <motion.span
            initial={{ scale: 0.4, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 13, delay: 0.2 }}
            style={{ position: 'absolute', left: '50%', bottom: 18, width: 150, height: 150, marginLeft: -75, borderRadius: 75, background: '#fff', display: 'grid', placeItems: 'center' }}
          >
            <Mascot mood={error ? 'oops' : 'hello'} size={112} />
          </motion.span>
          <motion.button
            aria-label="Retour"
            whileTap={{ scale: 0.9 }}
            onClick={() => nav('/', { replace: true })}
            style={{ position: 'absolute', left: 16, top: 'calc(var(--safe-top) + 14px)', width: 44, height: 44, borderRadius: 22, border: 'none', background: 'rgba(255,255,255,.22)', color: '#fff', display: 'grid', placeItems: 'center' }}
          >
            {Icon.back}
          </motion.button>
        </div>

        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 key={mode} className="display" style={{ fontSize: 38, lineHeight: 0.98, letterSpacing: '-0.05em' }}>
            <RevealLines lines={mode === 'register' ? [{ text: 'Garde ton Sip' }, { text: 'au chaud.', color: 'var(--primary)' }] : [{ text: 'Content de' }, { text: 'te revoir !', color: 'var(--primary)' }]} />
          </h1>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
            {mode === 'register' ? 'Crée ton compte pour retrouver ta leçon et continuer ton parcours.' : 'Connecte-toi pour reprendre là où tu en étais.'}
          </p>
        </div>

        <div style={{ margin: '0 16px', display: 'flex', borderRadius: 26, padding: 4, position: 'relative', background: 'var(--bg-deep)' }}>
          {(['register', 'login'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                play('tap')
                setMode(m)
                setError(null)
              }}
              style={{
                flex: 1,
                height: 46,
                border: 'none',
                background: 'transparent',
                fontSize: 15,
                position: 'relative',
                fontWeight: 700,
                color: mode === m ? 'var(--on-ink)' : 'var(--muted)',
                transition: 'color .2s',
              }}
            >
              {mode === m && (
                <motion.span
                  layoutId="auth-pill"
                  style={{ position: 'absolute', inset: 0, borderRadius: 22, background: 'var(--ink)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span style={{ position: 'relative' }}>{m === 'register' ? 'Créer un compte' : 'Se connecter'}</span>
            </button>
          ))}
        </div>

        <motion.form animate={shake} onSubmit={submit} style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" inputMode="email" placeholder="toi@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="8 caractères minimum"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
                style={{ border: 'none', background: 'none', padding: 4, margin: -4, color: 'var(--muted)', display: 'grid', placeItems: 'center' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword && <path d="M4 4l16 16" />}
                </svg>
              </button>
            </div>
            {mode === 'register' && password.length > 0 && password.length < 8 && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Encore {8 - password.length} caractère{8 - password.length > 1 ? 's' : ''}</span>
            )}
          </div>
          {error && (
            <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ color: 'var(--rose-ink)', fontWeight: 600, fontSize: 15, textAlign: 'center' }}>
              {error}
            </motion.p>
          )}
          <Button type="submit" disabled={busy || !email || password.length < 8} sound={null} style={{ marginTop: 6 }}>
            {busy ? '…' : mode === 'login' ? 'Je me connecte' : 'C’est parti'}
          </Button>
        </motion.form>
      </div>
    </Screen>
  )
}
