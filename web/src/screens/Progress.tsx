import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { Screen } from '../components/Screen'
import { illustration, SipIcon } from '../components/SipIcon'
import { Icon, IconButton } from '../components/ui'
import { Api, type SipSummary, type WeekStats } from '../lib/api'

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const inProgress = (s: SipSummary) => s.status === 'ready' && s.progress.total > 0 && s.progress.completed < s.progress.total

/** Streak, lessons, notions, this month's active days and where each Sip stands. */
export function Progress() {
  const nav = useNavigate()
  const stats = useQuery({ queryKey: ['stats'], queryFn: Api.stats })
  const sips = useQuery({ queryKey: ['sips'], queryFn: Api.sips })
  const s = stats.data
  const current = (sips.data ?? []).filter(inProgress)
  const finished = (sips.data ?? []).filter((x) => x.progress.total > 0 && x.progress.completed >= x.progress.total)
  const queries = [stats, sips]
  const offline = queries.some((q) => q.isPaused)
  const failed = queries.some((q) => q.isError)

  return (
    <Screen>
      <header className="topbar">
        <IconButton label="Retour" onClick={() => nav(-1)}>
          {Icon.back}
        </IconButton>
        <h1 className="display" style={{ fontSize: 24 }}>
          Tes progrès
        </h1>
      </header>

      <div className="scroll" style={{ padding: '8px 20px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(offline || failed) && <ErrorNotice message={offline ? 'Tu es hors ligne. Reconnecte-toi pour actualiser tes progrès.' : 'Impossible d’actualiser tes progrès. Réessaie.'} retry={() => { queries.forEach((q) => { void q.refetch() }) }} busy={queries.some((q) => q.isFetching)} />}
        {queries.some((q) => q.isLoading) && <p className="muted" role="status">Chargement de tes progrès…</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <Tile value={s?.streak_days} label={s?.streak_days === 1 ? 'jour de suite' : 'jours de suite'} bg="var(--rose)" ink="var(--rose-ink)" />
          <Tile value={s?.lessons_completed} label={s?.lessons_completed === 1 ? 'leçon bue' : 'leçons bues'} />
          <Tile value={s?.concepts} label={s?.concepts === 1 ? 'notion' : 'notions'} onClick={() => nav('/library?tab=notions')} />
        </div>

        {s?.this_week && <ThisWeek w={s.this_week} last={s.last_week ?? null} />}
        {s && s.lessons_completed > 0 && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 18, background: 'var(--sky)', color: 'var(--sky-ink)', fontSize: 14, lineHeight: 1.35, margin: 0 }}>
            <img src={illustration('scene-freeze')} alt="" width={44} height={44} style={{ flexShrink: 0, margin: '-6px 0' }} />
            {s.freeze_available
              ? 'Protection de série prête : si tu rates un jour cette semaine, ta série tient.'
              : 'Protection de série utilisée. Elle revient sept jours après.'}
          </p>
        )}

        {s?.month && <Month month={s.month} days={s.month_days ?? []} today={s.today ?? 1} />}
        {s && s.lessons_completed === 0 && (
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.45, padding: '0 4px' }}>
            Chaque jour où tu termines une leçon s’allume ici. Ta première leçon lance ta série.
          </p>
        )}

        {current.length > 0 && <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '6px 4px 0' }}>Sips en cours</h2>}
        {current.map((x, i) => (
          <SipProgress key={x.id} sip={x} delay={i} onOpen={() => nav(`/sips/${x.id}`)} />
        ))}
        {finished.length > 0 && <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '6px 4px 0' }}>Terminés</h2>}
        {finished.map((x, i) => (
          <SipProgress key={x.id} sip={x} delay={current.length + i} onOpen={() => nav(`/sips/${x.id}`)} />
        ))}
      </div>
    </Screen>
  )
}

/** This week so far, next to last week. */
function ThisWeek({ w, last }: { w: WeekStats; last: WeekStats | null }) {
  const diff = last ? w.lessons - last.lessons : 0
  const rows: [string, number, number | undefined][] = [
    ['Leçons', w.lessons, last?.lessons],
    ['Minutes', w.minutes, last?.minutes],
    ['Notions', w.notions, last?.notions],
  ]
  return (
    <section className="card" style={{ borderRadius: 24, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>Cette semaine</span>
        {last && last.lessons > 0 && (
          <span style={{ fontSize: 13, fontWeight: 600, color: diff >= 0 ? 'var(--mint-ink)' : 'var(--muted)' }}>
            {diff > 0 ? `+${diff} vs semaine dernière` : diff === 0 ? 'Comme la semaine dernière' : `${-diff} de moins que la semaine dernière`}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {rows.map(([label, n, before]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="display" style={{ fontSize: 24 }}>{n}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}{before !== undefined && before > 0 ? ` · ${before} avant` : ''}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Tile({ value, label, bg = 'var(--surface)', ink = 'var(--muted)', onClick }: { value?: number; label: string; bg?: string; ink?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="display" style={{ fontSize: 28, color: bg === 'var(--surface)' ? 'var(--ink)' : ink }}>
        {value ?? '—'}
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.25, color: ink }}>{label}</span>
    </>
  )
  const style = { borderRadius: 20, background: bg, padding: 12, display: 'flex', flexDirection: 'column' as const, gap: 2, border: 'none', textAlign: 'left' as const }
  return onClick ? (
    <motion.button whileTap={{ scale: 0.95 }} onClick={onClick} style={style}>
      {body}
    </motion.button>
  ) : (
    <div style={style}>{body}</div>
  )
}

/** The current month, Monday first: filled days had a finished lesson, a ring marks today. */
function Month({ month, days, today }: { month: string; days: number[]; today: number }) {
  const [y, m] = month.split('-').map(Number)
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const count = new Date(y, m, 0).getDate()
  const active = new Set(days)
  return (
    <section className="card" style={{ borderRadius: 24, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={`${MONTHS[m - 1]} : ${days.length} jours actifs`}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{MONTHS[m - 1]}</span>
        <span style={{ fontSize: 14, color: 'var(--muted)' }}>
          {days.length} jour{days.length > 1 ? 's' : ''} actif{days.length > 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, textAlign: 'center' }} aria-hidden="true">
        {'LMMJVSD'.split('').map((l, i) => (
          <span key={i} style={{ fontSize: 12, fontWeight: 600, color: 'var(--faint)' }}>
            {l}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const d = i + 1
          const on = active.has(d)
          return (
            <motion.span
              key={d}
              initial={on ? { scale: 0.5 } : false}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.1 + d * 0.012 }}
              style={{
                height: 34,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: on ? 600 : 500,
                // Only active days are filled: grey "missed" boxes would read as failures.
                background: on ? 'var(--primary)' : 'transparent',
                color: on ? '#fff' : d <= today ? 'var(--ink-soft)' : 'var(--faint)',
                boxShadow: d === today ? '0 0 0 2.5px var(--surface), 0 0 0 4.5px var(--primary)' : 'none',
              }}
            >
              {d}
            </motion.span>
          )
        })}
      </div>
    </section>
  )
}

function SipProgress({ sip, delay, onOpen }: { sip: SipSummary; delay: number; onOpen: () => void }) {
  const name = sip.title ?? sip.input_text
  const ratio = sip.progress.completed / Math.max(1, sip.progress.total)
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + delay * 0.05 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      style={{ border: 'none', borderRadius: 22, background: 'var(--surface)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
    >
      <SipIcon text={name} size={48} />
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span style={{ fontSize: 14, color: 'var(--muted)', flexShrink: 0 }}>
            {sip.progress.completed}/{sip.progress.total}
          </span>
        </span>
        <span style={{ height: 8, borderRadius: 4, background: 'var(--track)', overflow: 'hidden' }}>
          <motion.span
            initial={{ width: 0 }}
            animate={{ width: `${ratio * 100}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 18, delay: 0.2 + delay * 0.05 }}
            style={{ display: 'block', height: '100%', borderRadius: 4, background: ratio >= 1 ? 'var(--mint-lip)' : 'var(--primary)' }}
          />
        </span>
      </span>
    </motion.button>
  )
}
