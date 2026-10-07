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
      <div className="scroll" style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <div style={{ width: 104, height: 104, borderRadius: 32, display: 'grid', placeItems: 'center', background: 'var(--peach-soft)' }}>
            <Mascot mood={error ? 'oops' : 'hello'} size={80} />
          </div>
          <h1 className="display" style={{ fontSize: 30, lineHeight: 1.08, marginTop: 8 }}>
            {mode === 'register' ? 'Garde ton Sip au chaud' : 'Content de te revoir !'}
          </h1>
          <p className="muted" style={{ fontSize: 16, lineHeight: 1.45 }}>
            {mode === 'register' ? 'Crée ton compte pour retrouver ta leçon et continuer ton parcours.' : 'Connecte-toi pour reprendre là où tu en étais.'}
          </p>
        </motion.div>

        <div style={{ display: 'flex', borderRadius: 26, padding: 4, position: 'relative', background: 'var(--bg-deep)' }}>
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
                fontWeight: 600,
                position: 'relative',
                color: mode === m ? 'var(--ink)' : 'var(--muted)',
              }}
            >
              {mode === m && (
                <motion.span
                  layoutId="auth-pill"
                  style={{ position: 'absolute', inset: 0, borderRadius: 22, background: 'var(--surface)' }}
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
