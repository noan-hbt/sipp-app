import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Mascot } from '../components/Mascot'
import { RevealLines } from '../components/motion'
import { Screen } from '../components/Screen'
import { Button } from '../components/ui'
import { ErrorNotice } from '../components/ErrorNotice'
import { Api, apiErrorMessage, type Me } from '../lib/api'
import { t } from '../lib/i18n'

/** Once per account, before any request reaches the AI: what is sent, to whom, and what never is. */
export function AiConsent() {
  const qc = useQueryClient()
  const agree = useMutation({
    mutationFn: Api.aiConsent,
    onSuccess: (me) => qc.setQueryData<Me>(['me'], me),
  })
  return (
    <Screen kind="fade">
      <div className="scroll" style={{ padding: 'calc(var(--safe-top) + 36px) 22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Mascot mood="think" size={84} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="kicker" style={{ color: 'var(--primary)' }}>{t.aiConsent.kicker}</span>
          <h1 className="display" style={{ fontSize: 34, lineHeight: 1, letterSpacing: '-0.045em' }}>
            <RevealLines lines={[{ text: t.aiConsent.title[0] }, { text: t.aiConsent.title[1], color: 'var(--primary)' }]} />
          </h1>
        </div>
        <motion.ul
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {t.aiConsent.points.map((p) => (
            <li key={p.title} style={{ borderRadius: 20, padding: '12px 14px', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{p.title}</span>
              <span className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>{p.body}</span>
            </li>
          ))}
        </motion.ul>
        {agree.isError && <ErrorNotice message={apiErrorMessage(agree.error, t.aiConsent.failed)} retry={() => agree.mutate()} busy={agree.isPending} />}
      </div>
      <div className="bottom-bar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button onClick={() => agree.mutate()} disabled={agree.isPending} sound="pop">
          {t.aiConsent.agree}
        </Button>
        <Button variant="ghost" style={{ height: 48, fontSize: 16 }} onClick={() => void Api.logout().catch(() => undefined)}>
          {t.aiConsent.logout}
        </Button>
      </div>
    </Screen>
  )
}
