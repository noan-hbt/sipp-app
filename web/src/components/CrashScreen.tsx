import { Component, type ReactNode } from 'react'
import { reportError } from '../lib/telemetry'
import { Mascot } from './Mascot'

/** Last resort: a render crash shows a way out instead of a blank screen, and is reported. */
export class CrashScreen extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error: unknown) {
    reportError(error)
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', background: 'var(--bg)' }}>
        <Mascot mood="oops" size={110} />
        <h1 className="title-l">Oups, quelque chose a coincé</h1>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.45, maxWidth: 320 }}>
          Ta progression est enregistrée. Recharge l’app pour reprendre là où tu en étais.
        </p>
        <button
          type="button"
          onClick={() => window.location.assign('/')}
          style={{ marginTop: 8, height: 52, padding: '0 28px', borderRadius: 26, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 16, fontWeight: 700 }}
        >
          Recharger
        </button>
      </div>
    )
  }
}
