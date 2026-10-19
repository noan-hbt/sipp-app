import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button } from '../components/ui'
import { Api, type Plan } from '../lib/api'
import { play } from '../lib/sound'
import { t } from '../lib/i18n'

const NAMES: Record<Plan['plan'], string> = t.plans.names
const WAIT_MS = 90_000

/** Back from Paddle: access only opens once Paddle's webhook confirmed the subscription. */
export function BillingReturn() {
  const nav = useNavigate()
  const [timedOut, setTimedOut] = useState(false)
  const plan = useQuery({
    queryKey: ['plan'],
    queryFn: Api.plan,
    refetchInterval: (q) => (q.state.data?.subscription || timedOut ? false : 2000),
  })
  const active = !!plan.data?.subscription
  const late = !active && timedOut
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), WAIT_MS)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (active) play('complete')
  }, [active])

  return (
    <Screen kind="fade">
      <div className="scroll" style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', flex: 1 }}>
        <Mascot mood={active ? 'bravo' : late ? 'oops' : 'think'} size={120} />
        <h1 className="title-l" aria-live="polite">
          {active ? t.billingReturn.welcome(NAMES[plan.data!.plan]) : late ? t.billingReturn.lateTitle : t.billingReturn.activating}
        </h1>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
          {active
            ? t.billingReturn.ready
            : late
              ? t.billingReturn.lateBody
              : t.billingReturn.wait}
        </p>
      </div>
      <div className="bottom-bar">
        <Button disabled={!active && !late} onClick={() => nav('/', { replace: true })}>
          {active ? t.auth.registerCta : t.billingReturn.home}
        </Button>
      </div>
    </Screen>
  )
}
