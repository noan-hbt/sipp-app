import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { Button } from '../components/ui'
import { Api, type Plan } from '../lib/api'
import { play } from '../lib/sound'

const NAMES: Record<Plan['plan'], string> = { free: 'Gratuit', basic: 'Essentiel', plus: 'Plus', max: 'Équipe' }
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
          {active ? `Bienvenue dans ${NAMES[plan.data!.plan]} !` : late ? 'Ton paiement est en cours de validation' : 'On active ton abonnement…'}
        </h1>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
          {active
            ? 'Tout est prêt : lance-toi sur ce qui te fait envie.'
            : late
              ? 'Ça prend un peu plus longtemps que prévu. Ton offre s’activera toute seule d’ici quelques minutes. Si rien ne change, écris-nous à hello@sipp.app.'
              : 'Quelques secondes, le temps que le paiement soit confirmé.'}
        </p>
      </div>
      <div className="bottom-bar">
        <Button disabled={!active && !late} onClick={() => nav('/', { replace: true })}>
          {active ? 'C’est parti' : 'Revenir à l’accueil'}
        </Button>
      </div>
    </Screen>
  )
}
