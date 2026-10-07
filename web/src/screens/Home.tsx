import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { itemVariants as item, listVariants as list } from '../components/SipCard'
import { SipIcon, sipPalette } from '../components/SipIcon'
import { Button, Icon } from '../components/ui'
import { Api, type SipSummary } from '../lib/api'
import { play } from '../lib/sound'

function greeting() {
  const h = new Date().getHours()
  return h < 6 ? 'Encore debout ?' : h < 12 ? 'Bonjour' : h < 18 ? 'Salut' : 'Bonsoir'
}

export function Home() {
  const nav = useNavigate()
  const sips = useQuery({
    queryKey: ['sips'],
    queryFn: Api.sips,
    refetchInterval: (q) => (q.state.data?.some((s) => s.status === 'queued' || s.status === 'generating') ? 3000 : false),
  })
  const stats = useQuery({ queryKey: ['stats'], queryFn: Api.stats })

  const all = sips.data ?? []
  const resume = all.find((s) => s.status === 'ready' && s.progress.completed < s.progress.total)
  // Other Sips worth a glance today: in progress or being built, most recent first.
  const others = all.filter((s) => s !== resume && !(s.progress.total > 0 && s.progress.completed >= s.progress.total)).slice(0, 3)

  return (
    <Screen>
      <header className="topbar" style={{ padding: 'calc(var(--safe-top) + 18px) 22px 6px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <span className="muted" style={{ fontSize: 14, fontWeight: 700 }}>
              {greeting()}
            </span>
            <h1 style={{ fontSize: 28, fontWeight: 900 }}>Aujourd’hui</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <motion.div
            className="card"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.2 }}
            style={{ height: 44, padding: '0 14px', borderRadius: 22, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 900 }}
            aria-label={`Série de ${stats.data?.streak_days ?? 0} jours`}
          >
            <motion.span
              animate={stats.data?.completed_today ? { scale: [1, 1.18, 1], rotate: [0, -6, 6, 0] } : { opacity: 0.45 }}
              transition={{ duration: 1.6, repeat: stats.data?.completed_today ? Infinity : 0, repeatDelay: 1.2 }}
              style={{ display: 'grid', filter: stats.data?.completed_today ? 'none' : 'grayscale(1)' }}
            >
              {Icon.flame}
            </motion.span>
            {stats.data?.streak_days ?? 0}
          </motion.div>
        </div>
      </header>

      <div className="scroll" style={{ padding: '18px 22px 130px' }}>
        {sips.isLoading ? (
          <Skeleton />
        ) : all.length === 0 ? (
          <Empty onStart={() => nav('/new')} />
        ) : (
          <motion.div variants={list} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {resume && (
              <motion.section variants={item} className="raised" style={{ borderRadius: 30, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <SipIcon id={resume.id} size={58} />
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#9c4a22', textTransform: 'uppercase', letterSpacing: '.06em' }}>{resume.chapter ? `On reprend · chapitre ${resume.chapter}` : 'On reprend ?'}</span>
                    <h2 style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>{resume.title}</h2>
                  </div>
                </div>
                {resume.next_lesson_title && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)' }}>
                      Prochaine leçon · {resume.progress.completed + 1} sur {resume.progress.total}
                    </span>
                    <p style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.35 }}>{resume.next_lesson_title}</p>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'var(--track)', overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(resume.progress.completed / Math.max(1, resume.progress.total)) * 100}%` }}
                      transition={{ type: 'spring', stiffness: 80, damping: 18, delay: 0.3 }}
                      style={{ height: '100%', borderRadius: 5, background: 'var(--peach)' }}
                    />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--muted)' }}>
                    {resume.progress.completed}/{resume.progress.total}
                  </span>
                </div>
                <Button onClick={() => nav(`/sips/${resume.id}`)}>{resume.progress.completed > 0 ? 'Reprendre' : 'C’est parti'} · 5 min</Button>
              </motion.section>
            )}

            {others.length > 0 && (
              <motion.div variants={item} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '6px 4px 0' }}>
                <h3 style={{ fontSize: 16, fontWeight: 900 }}>{resume ? 'Aussi en cours' : 'En cours'}</h3>
                <button onClick={() => nav('/library', { replace: true })} style={{ border: 'none', background: 'none', fontSize: 14, fontWeight: 900, color: '#9c4a22' }}>
                  Tout voir
                </button>
              </motion.div>
            )}
            {others.map((s) => (
              <MiniCard key={s.id} sip={s} onOpen={() => nav(s.status === 'ready' ? `/sips/${s.id}` : `/sips/${s.id}/building`)} />
            ))}
            <motion.div variants={item} style={{ marginTop: 4 }}>
              <Button variant="soft" onClick={() => nav('/new')} sound="pop">
                <span style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--ink)', color: 'var(--bg)', display: 'grid', placeItems: 'center' }}>{Icon.plus}</span>
                Apprendre autre chose
              </Button>
            </motion.div>
          </motion.div>
        )}
      </div>
    </Screen>
  )
}

function MiniCard({ sip, onOpen }: { sip: SipSummary; onOpen: () => void }) {
  const building = sip.status === 'queued' || sip.status === 'generating'
  const failed = sip.status === 'failed'
  const pal = sipPalette(sip.id)
  return (
    <motion.button
      variants={item}
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        play('tap')
        onOpen()
      }}
      className="card"
      style={{ border: 'none', textAlign: 'left', borderRadius: 24, padding: 12, display: 'flex', alignItems: 'center', gap: 12, background: failed ? 'var(--rose-soft)' : undefined }}
    >
      {building ? <Mascot mood="think" size={44} /> : failed ? <Mascot mood="oops" size={44} /> : <SipIcon id={sip.id} size={44} />}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sip.title ?? sip.input_text}</span>
        {building ? (
          <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Je trace ton chemin…</span>
        ) : failed ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--rose-ink)' }}>Raté, touche pour réessayer</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--track)' }}>
              <div style={{ width: `${(sip.progress.completed / Math.max(1, sip.progress.total)) * 100}%`, height: '100%', borderRadius: 3, background: pal.bar }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--muted)' }}>
              {sip.progress.completed}/{sip.progress.total}
            </span>
          </div>
        )}
      </div>
    </motion.button>
  )
}

function Empty({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', paddingTop: 60 }}
    >
      <div className="raised" style={{ width: 150, height: 150, borderRadius: 75, display: 'grid', placeItems: 'center' }}>
        <Mascot size={110} />
      </div>
      <h2 className="title-m">Qu’est-ce qu’on apprend ?</h2>
      <p className="muted" style={{ fontSize: 16, maxWidth: 280 }}>
        N’importe quel sujet. Je construis le parcours, tu avances cinq minutes à la fois.
      </p>
      <div style={{ width: '100%', maxWidth: 300, marginTop: 8 }}>
        <Button onClick={onStart}>Mon premier Sip</Button>
      </div>
    </motion.div>
  )
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {[220, 140].map((h, i) => (
        <motion.div
          key={i}
          className="raised"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
          style={{ height: h, borderRadius: 30 }}
        />
      ))}
    </div>
  )
}
