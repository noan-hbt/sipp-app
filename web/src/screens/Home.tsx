import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mascot } from '../components/Mascot'
import { Screen } from '../components/Screen'
import { SipIcon, sipPalette } from '../components/SipIcon'
import { Button, Icon, IconButton } from '../components/ui'
import { Api, setTokens, type SipSummary } from '../lib/api'
import { play, setSoundEnabled, soundEnabled } from '../lib/sound'

const list = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }
const item = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 22 } },
}

function greeting() {
  const h = new Date().getHours()
  return h < 6 ? 'Encore debout ?' : h < 12 ? 'Bonjour' : h < 18 ? 'Salut' : 'Bonsoir'
}

export function Home() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const sips = useQuery({
    queryKey: ['sips'],
    queryFn: Api.sips,
    refetchInterval: (q) => (q.state.data?.some((s) => s.status === 'queued' || s.status === 'generating') ? 3000 : false),
  })
  const stats = useQuery({ queryKey: ['stats'], queryFn: Api.stats })
  const [settings, setSettings] = useState(false)

  const all = sips.data ?? []
  const resume = all.find((s) => s.status === 'ready' && s.progress.completed < s.progress.total)
  const others = all.filter((s) => s !== resume)

  return (
    <Screen>
      <header className="topbar" style={{ padding: 'calc(var(--safe-top) + 18px) 22px 6px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mascot size={52} />
          <div>
            <span className="muted" style={{ fontSize: 14, fontWeight: 700 }}>
              {greeting()}
            </span>
            <h1 style={{ fontSize: 28, fontWeight: 900 }}>Mes Sips</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <motion.div
            className="raised-sm"
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
          <IconButton label="Réglages" onClick={() => setSettings(true)}>
            {Icon.user}
          </IconButton>
        </div>
      </header>

      <div className="scroll" style={{ padding: '18px 22px 140px' }}>
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
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#B5582A', textTransform: 'uppercase', letterSpacing: '.06em' }}>On reprend ?</span>
                    <h2 style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>{resume.title}</h2>
                  </div>
                </div>
                <div className="inset" style={{ borderRadius: 18, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'var(--bg-deep)', overflow: 'hidden' }}>
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
                <Button onClick={() => nav(`/sips/${resume.id}`)}>C’est parti · 5 min</Button>
              </motion.section>
            )}

            {others.length > 0 && (
              <motion.h3 variants={item} style={{ margin: '6px 4px 0', fontSize: 16, fontWeight: 900 }}>
                Tous mes Sips
              </motion.h3>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              {others.map((s) => (
                <SipCard key={s.id} sip={s} onOpen={() => nav(s.status === 'ready' ? `/sips/${s.id}` : `/sips/${s.id}/building`)} />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <div className="bottom-fade">
        <Button variant="soft" onClick={() => nav('/new')} sound="pop">
          <span style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--ink)', color: 'var(--bg)', display: 'grid', placeItems: 'center' }}>{Icon.plus}</span>
          Apprendre un truc nouveau
        </Button>
      </div>

      <AnimatePresence>
        {settings && (
          <Settings
            onClose={() => setSettings(false)}
            onLogout={async () => {
              await Api.logout().catch(() => undefined)
              qc.clear()
              setTokens(null)
            }}
          />
        )}
      </AnimatePresence>
    </Screen>
  )
}

function SipCard({ sip, onOpen }: { sip: SipSummary; onOpen: () => void }) {
  const building = sip.status === 'queued' || sip.status === 'generating'
  const failed = sip.status === 'failed'
  const done = sip.progress.total > 0 && sip.progress.completed >= sip.progress.total
  const pal = sipPalette(sip.id)
  return (
    <motion.button
      variants={item}
      layout
      onClick={() => {
        play('tap')
        onOpen()
      }}
      whileTap={{ scale: 0.96 }}
      className={building ? 'inset' : 'raised'}
      style={{ border: 'none', textAlign: 'left', borderRadius: 26, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: failed ? 'var(--rose-soft)' : 'var(--bg)' }}
    >
      {building ? <Mascot mood="think" size={48} bob={false} /> : failed ? <Mascot mood="oops" size={48} bob={false} /> : <SipIcon id={sip.id} />}
      <span style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.25 }}>{sip.title ?? sip.input_text}</span>
      {building ? (
        <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>
          Je trace ton chemin…
        </span>
      ) : failed ? (
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--rose-ink)' }}>Raté, touche pour réessayer</span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-deep)' }}>
            <div style={{ width: `${(sip.progress.completed / Math.max(1, sip.progress.total)) * 100}%`, height: '100%', borderRadius: 4, background: pal.bar }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 900, color: done ? 'var(--mint-ink)' : 'var(--muted)' }}>
            {done ? 'Fini' : `${sip.progress.completed}/${sip.progress.total}`}
          </span>
        </div>
      )}
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

function Settings({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const [sound, setSound] = useState(soundEnabled())
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(43,38,32,.25)', zIndex: 20 }}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, i) => i.offset.y > 80 && onClose()}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 21,
          background: 'var(--bg)',
          borderRadius: '34px 34px 0 0',
          padding: '12px 22px calc(var(--safe-bottom) + 26px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 -10px 30px rgba(120,90,60,.18)',
        }}
      >
        <span style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, background: 'var(--shadow-dark)' }} />
        <h2 className="title-m">Réglages</h2>
        <button
          onClick={() => {
            setSound(!sound)
            setSoundEnabled(!sound)
          }}
          className="raised-sm"
          style={{ border: 'none', borderRadius: 22, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 16, fontWeight: 800 }}
        >
          {Icon.sound(sound)}
          <span style={{ flex: 1, textAlign: 'left' }}>Effets sonores</span>
          <span className="inset" style={{ width: 54, height: 32, borderRadius: 16, padding: 3, display: 'flex', justifyContent: sound ? 'flex-end' : 'flex-start' }}>
            <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 30 }} style={{ width: 26, height: 26, borderRadius: 13, background: sound ? 'var(--peach)' : 'var(--faint)' }} />
          </span>
        </button>
        <Button variant="ghost" onClick={onLogout} style={{ height: 50, fontSize: 16, color: 'var(--rose-ink)' }}>
          Se déconnecter
        </Button>
      </motion.div>
    </>
  )
}
