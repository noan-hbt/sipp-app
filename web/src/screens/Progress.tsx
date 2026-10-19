import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { CountUp, LiquidBar } from '../components/motion'
import { Screen } from '../components/Screen'
import { illustration, SipIcon } from '../components/SipIcon'
import { Icon, IconButton } from '../components/ui'
import { Api, type SipSummary, type Stats, type WeekStats } from '../lib/api'
import { t, locale, plural } from '../lib/i18n'

const monthName = (m: number) => {
  const s = new Date(2000, m - 1, 1).toLocaleDateString(locale, { month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

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
        <IconButton label={t.common.back} onClick={() => nav(-1)}>
          {Icon.back}
        </IconButton>
        <h1 className="display" style={{ fontSize: 28 }}>
          {t.progress.title}
        </h1>
      </header>

      <div className="scroll" style={{ padding: '8px 20px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(offline || failed) && <ErrorNotice message={offline ? t.progress.offline : t.progress.failed} retry={() => { queries.forEach((q) => { void q.refetch() }) }} busy={queries.some((q) => q.isFetching)} />}
        {queries.some((q) => q.isLoading) && <p className="muted" role="status">{t.progress.loading}</p>}
        {s && <StreakHero s={s} />}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <Tile value={s?.lessons_completed} label={plural(s?.lessons_completed ?? 0, t.progress.lessonDone, t.progress.lessonsDone)} bg="var(--peach-soft)" ink="var(--peach-ink)" delay={0.15} />
          <Tile value={s?.concepts} label={plural(s?.concepts ?? 0, t.home.recap.notion, t.home.recap.notions)} bg="var(--lavender)" ink="var(--lavender-ink)" delay={0.25} onClick={() => nav('/library?tab=notions')} />
          <Tile value={s?.total_stars} label={plural(s?.total_stars ?? 0, t.share.star, t.share.stars)} bg="var(--butter)" ink="var(--butter-ink)" delay={0.35} />
        </div>

        {s?.this_week && <ThisWeek w={s.this_week} last={s.last_week ?? null} />}

        {s?.month && <Month month={s.month} days={s.month_days ?? []} today={s.today ?? 1} />}
        {s && s.lessons_completed === 0 && (
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.45, padding: '0 4px' }}>
            {t.progress.empty}
          </p>
        )}

        {current.length > 0 && <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '6px 4px 0' }}>{t.progress.current}</h2>}
        {current.map((x, i) => (
          <SipProgress key={x.id} sip={x} delay={i} onOpen={() => nav(`/sips/${x.id}`)} />
        ))}
        {finished.length > 0 && <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', margin: '6px 4px 0' }}>{t.library.filters.done}</h2>}
        {finished.map((x, i) => (
          <SipProgress key={x.id} sip={x} delay={current.length + i} onOpen={() => nav(`/sips/${x.id}`)} />
        ))}
      </div>
    </Screen>
  )
}

/** The streak as a hero: big rolling number, freeze status underneath. */
function StreakHero({ s }: { s: Stats }) {
  const n = s.streak_days
  return (
    <motion.section
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      aria-label={t.progress.streakLabel(n)}
      style={{ position: 'relative', overflow: 'hidden', borderRadius: 30, padding: 20, minHeight: 200, background: 'var(--dock)', color: 'var(--dock-ink)', boxShadow: 'inset 0 0 0 1px var(--dock-line)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}
    >
      <motion.span
        aria-hidden="true"
        initial={{ scale: 0.2 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 110, damping: 15, delay: 0.1 }}
        style={{ position: 'absolute', right: -50, top: -50, width: 200, height: 200, borderRadius: 100, background: 'var(--dock-accent)' }}
      />
      <motion.span
        aria-hidden="true"
        initial={{ scale: 0, rotate: -25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.3 }}
        style={{ position: 'absolute', right: 4, top: 4 }}
      >
        <img src={illustration('scene-freeze')} alt="" width={112} height={112} style={{ display: 'block' }} />
      </motion.span>
      <span className="kicker" style={{ position: 'relative', color: 'var(--dock-kicker)' }}>
        {s.completed_today ? t.progress.streakOn : n ? t.progress.streakKeep : t.progress.streak}
      </span>
      <span style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <span className="hero-num" style={{ fontSize: n > 99 ? 84 : 104 }}>
          <CountUp value={n} delay={0.2} duration={1.2} />
        </span>
        <span style={{ fontSize: 16, lineHeight: 1.2, color: 'var(--dock-muted)', paddingBottom: 4 }}>
          {t.progress.days(n)}
          <br />
          {t.progress.inARow}
        </span>
      </span>
      <span style={{ position: 'relative', fontSize: 13, lineHeight: 1.35, color: 'var(--dock-muted)' }}>
        {s.lessons_completed === 0
          ? t.progress.firstLesson
          : s.freeze_available
            ? t.progress.freezeReady
            : t.progress.freezeUsed}
      </span>
    </motion.section>
  )
}

/** This week so far, next to last week. */
function ThisWeek({ w, last }: { w: WeekStats; last: WeekStats | null }) {
  const diff = last ? w.lessons - last.lessons : 0
  const rows: [string, number, number | undefined][] = [
    [t.progress.week.lessons, w.lessons, last?.lessons],
    [t.progress.week.minutes, w.minutes, last?.minutes],
    [t.progress.week.notions, w.notions, last?.notions],
  ]
  return (
    <section className="card" style={{ borderRadius: 24, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{t.progress.week.title}</span>
        {last && last.lessons > 0 && (
          <span style={{ fontSize: 13, fontWeight: 600, color: diff >= 0 ? 'var(--mint-ink)' : 'var(--muted)' }}>
            {diff > 0 ? t.progress.week.more(diff) : diff === 0 ? t.progress.week.same : t.progress.week.less(-diff)}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {rows.map(([label, n, before]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="display" style={{ fontSize: 26 }}><CountUp value={n} delay={0.3} /></span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
            {before !== undefined && before > 0 && (
            <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
              <span style={{ height: 6, borderRadius: 3, background: 'var(--bg-deep)', overflow: 'hidden' }}>
                <motion.span initial={{ width: 0 }} animate={{ width: `${(n / Math.max(1, n, before ?? 0)) * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18, delay: 0.35 }} style={{ display: 'block', height: '100%', borderRadius: 3, background: 'var(--primary)' }} />
              </span>
              <span style={{ height: 6, borderRadius: 3, background: 'var(--bg-deep)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${(before / Math.max(1, n, before)) * 100}%`, borderRadius: 3, background: 'var(--line-strong)' }} />
              </span>
            </span>
            )}
            {before !== undefined && before > 0 && <span style={{ fontSize: 11, color: 'var(--faint)' }}>{t.progress.week.before(before)}</span>}
          </div>
        ))}
      </div>
    </section>
  )
}

function Tile({ value, label, bg, ink, delay = 0, onClick }: { value?: number; label: string; bg: string; ink: string; delay?: number; onClick?: () => void }) {
  const body = (
    <>
      <span className="hero-num" style={{ fontSize: 34, color: 'var(--ink)', paddingTop: 4 }}>
        {value === undefined ? '—' : <CountUp value={value} delay={delay + 0.15} />}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25, color: ink }}>{label}</span>
    </>
  )
  const style = { borderRadius: 22, background: bg, padding: 14, display: 'flex', flexDirection: 'column' as const, gap: 6, border: 'none', textAlign: 'left' as const }
  const anim = { initial: { opacity: 0, y: 14, scale: 0.92 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { type: 'spring' as const, stiffness: 300, damping: 20, delay } }
  return onClick ? (
    <motion.button {...anim} whileTap={{ scale: 0.95 }} onClick={onClick} style={style}>
      {body}
    </motion.button>
  ) : (
    <motion.div {...anim} style={style}>
      {body}
    </motion.div>
  )
}

/** The current month, Monday first: filled days had a finished lesson, a ring marks today. */
function Month({ month, days, today }: { month: string; days: number[]; today: number }) {
  const [y, m] = month.split('-').map(Number)
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const count = new Date(y, m, 0).getDate()
  const active = new Set(days)
  return (
    <section className="card" style={{ borderRadius: 24, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={t.speech.pair(monthName(m), t.progress.activeDays(days.length))}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{monthName(m)}</span>
        <span style={{ fontSize: 14, color: 'var(--muted)' }}>
          {t.progress.activeDays(days.length)}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, textAlign: 'center' }} aria-hidden="true">
        {t.home.weekLetters.split('').map((l, i) => (
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
          const col = (lead + i) % 7
          const joinLeft = on && col > 0 && active.has(d - 1)
          const joinRight = on && col < 6 && active.has(d + 1)
          return (
            <motion.span
              key={d}
              initial={on ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: 0.1 + d * 0.012 }}
              style={{
                height: 34,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: on ? 600 : 500,
                position: 'relative',
                color: on ? '#fff' : d <= today ? 'var(--ink-soft)' : 'var(--faint)',
                boxShadow: d === today && !on ? 'inset 0 0 0 2px var(--primary)' : 'none',
              }}
            >
              {/* Only active days are filled: grey "missed" boxes would read as failures. Runs of days join up. */}
              {on && (
                <span
                  style={{
                    position: 'absolute', top: 0, bottom: 0, left: joinLeft ? -3 : 0, right: joinRight ? -3 : 0, background: 'var(--primary)',
                    borderRadius: `${joinLeft ? 0 : 12}px ${joinRight ? 0 : 12}px ${joinRight ? 0 : 12}px ${joinLeft ? 0 : 12}px`,
                    boxShadow: d === today ? 'inset 0 0 0 2.5px color-mix(in srgb, #fff 55%, transparent)' : 'none',
                  }}
                />
              )}
              <span style={{ position: 'relative' }}>{d}</span>
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
      style={{ border: 'none', borderRadius: 24, background: 'var(--surface)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
    >
      <SipIcon text={name} theme={sip.theme} size={48} />
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span style={{ fontSize: 14, color: 'var(--muted)', flexShrink: 0 }}>
            {sip.progress.completed}/{sip.progress.total}
          </span>
        </span>
        <span style={{ display: 'flex' }}>
          <LiquidBar value={ratio} height={8} color={ratio >= 1 ? 'var(--mint-lip)' : 'var(--primary)'} delay={0.2 + delay * 0.05} />
        </span>
      </span>
    </motion.button>
  )
}
