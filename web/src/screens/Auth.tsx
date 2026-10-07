import { motion, useAnimationControls } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, ApiError, setTokens } from '../lib/api'
import { play } from '../lib/sound'

export function Auth({ initial = 'register' }: { initial?: 'login' | 'register' }) {
  const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>(initial)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      <header className="topbar">
        <IconButton label="Retour" onClick={() => nav('/', { replace: true })}>
          {Icon.back}
        </IconButton>
      </header>
      <div className="scroll" style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}
        >
          <div className="raised" style={{ width: 140, height: 140, borderRadius: 70, display: 'grid', placeItems: 'center' }}>
            <Mascot mood={error ? 'oops' : 'hello'} size={104} />
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em' }}>Sipp</h1>
          <p className="muted" style={{ fontSize: 17, fontWeight: 700, maxWidth: 280 }}>
            {mode === 'register' ? 'Crée ton compte pour garder ton parcours et ta progression.' : 'Content de te revoir !'}
          </p>
        </motion.div>

        <div className="inset" style={{ display: 'flex', borderRadius: 26, padding: 5, position: 'relative' }}>
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
                fontWeight: 900,
                position: 'relative',
                color: mode === m ? 'var(--ink)' : 'var(--muted)',
              }}
            >
              {mode === m && (
                <motion.span
                  layoutId="auth-pill"
                  className="raised-sm"
                  style={{ position: 'absolute', inset: 0, borderRadius: 22 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span style={{ position: 'relative' }}>{m === 'register' ? 'Créer un compte' : 'Se connecter'}</span>
            </button>
          ))}
        </div>

        <motion.form animate={shake} onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" inputMode="email" placeholder="toi@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="8 caractères minimum"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ color: 'var(--rose-ink)', fontWeight: 800, fontSize: 15, textAlign: 'center' }}>
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
