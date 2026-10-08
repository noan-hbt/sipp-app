import { Button } from './ui'

export function ErrorNotice({ message, retry, busy = false }: { message: string; retry: () => void; busy?: boolean }) {
  return (
    <div style={{ padding: 18, borderRadius: 20, background: 'var(--rose-soft)', display: 'grid', gap: 12 }}>
      <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 15 }}>{message}</p>
      <Button onClick={retry} disabled={busy}>Réessayer</Button>
    </div>
  )
}
