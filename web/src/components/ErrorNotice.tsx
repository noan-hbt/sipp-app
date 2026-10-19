import { Button } from './ui'
import { t } from '../lib/i18n'

export function ErrorNotice({ message, retry, busy = false }: { message: string; retry: () => void; busy?: boolean }) {
  return (
    <div style={{ padding: 18, borderRadius: 20, background: 'var(--rose-soft)', display: 'grid', gap: 12 }}>
      <p role="alert" style={{ color: 'var(--rose-ink)', fontSize: 15 }}>{message}</p>
      <Button onClick={retry} disabled={busy}>{t.common.retry}</Button>
    </div>
  )
}
