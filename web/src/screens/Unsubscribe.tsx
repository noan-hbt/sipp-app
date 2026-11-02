import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button } from '../components/ui'
import { Api, ApiError } from '../lib/api'
import { t } from '../lib/i18n'

/** The link at the bottom of a reminder email: turns those emails off right away, signed in or not. */
export function Unsubscribe() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { mutate, ...off } = useMutation({
    mutationFn: () => Api.unsubscribe(token),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }),
  })
  useEffect(() => {
    if (token) mutate()
  }, [token, mutate])
  const invalid = !token || (off.error instanceof ApiError && off.error.status === 400)

  return (
    <Screen kind="fade">
      <div className="scroll" style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', flex: 1 }}>
        <Mascot mood={off.isSuccess ? 'bravo' : off.isError || invalid ? 'oops' : 'think'} size={120} />
        <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {off.isSuccess ? (
            <>
              <h1 className="title-l">{t.account.unsubscribeTitle}</h1>
              <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>{t.account.unsubscribeBody}</p>
            </>
          ) : invalid ? (
            <p style={{ fontSize: 16, lineHeight: 1.45 }}>{t.account.unsubscribeInvalid}</p>
          ) : off.isError ? (
            <p style={{ fontSize: 16, lineHeight: 1.45 }}>{t.auth.unreachable}</p>
          ) : (
            <p className="muted">{t.account.unsubscribeWorking}</p>
          )}
        </div>
        {off.isError && !invalid && <Button variant="ghost" onClick={() => mutate()}>{t.common.retry}</Button>}
      </div>
      <div className="bottom-bar">
        <Button onClick={() => nav('/', { replace: true })}>{t.account.home}</Button>
      </div>
    </Screen>
  )
}
