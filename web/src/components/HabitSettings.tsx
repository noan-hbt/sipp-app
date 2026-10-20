import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Api, TZ, type Settings } from '../lib/api'
import { disablePush, enablePush, pushSupported } from '../lib/push'
import { track } from '../lib/telemetry'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { t, lang, setLang, type Lang } from '../lib/i18n'

const GOALS = [1, 2, 3, 5]
const HOURS = [7, 8, 9, 12, 13, 18, 19, 20, 21, 22]
const THEMES: [Theme, string][] = [['system', t.habits.themes.system], ['light', t.habits.themes.light], ['dark', t.habits.themes.dark]]
const LANGS: [Lang, string][] = [['fr', 'Français'], ['en', 'English']]

function Chips<T extends string | number>({ label, value, options, onPick, disabled }: {
  label: string
  value: T
  options: [T, string][]
  onPick: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([v, text]) => {
        const on = v === value
        return (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onPick(v)}
            style={{
              border: 'none', borderRadius: 14, padding: '8px 14px', fontSize: 15, fontWeight: 600, minWidth: 44,
              background: on ? 'var(--primary)' : 'var(--bg-deep)', color: on ? '#fff' : 'var(--ink-soft)',
            }}
          >
            {text}
          </button>
        )
      })}
    </div>
  )
}

const block = { padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 10 }
const title = { fontSize: 16, fontWeight: 600 }
const hint = { fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }

/** Daily goal, reminder and theme: the habit side of the profile. */
export function HabitSettings() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: Api.settings })
  const [theme, setThemeState] = useState(getTheme)
  const [pushError, setPushError] = useState<string | null>(null)
  const put = (data: Settings) => {
    qc.setQueryData(['settings'], data)
    void qc.invalidateQueries({ queryKey: ['stats'] })
  }
  const save = useMutation({
    mutationFn: Api.saveSettings,
    onSuccess: put,
  })
  const reminder = useMutation({
    mutationFn: async (on: boolean) => {
      setPushError(null)
      const s = settings.data!
      if (!on) {
        await Api.saveSettings({ reminder_hour: -1 })
        return disablePush()
      }
      await enablePush()
      track('reminder_enabled', { hour: s.reminder_hour ?? 19 })
      return Api.saveSettings({ reminder_hour: s.reminder_hour ?? 19, timezone: TZ, language: lang })
    },
    onSuccess: put,
    onError: (e) => {
      setPushError(
        e instanceof Error && e.message === 'denied'
          ? t.habits.pushDenied
          : t.habits.pushFailed,
      )
    },
  })
  const test = useMutation({ mutationFn: Api.testPush })
  const s = settings.data
  const reminderOn = !!s && s.reminder_hour !== null && s.push_enabled
  const canPush = !!s?.push_available && pushSupported()

  return (
    <div className="card" style={{ borderRadius: 24, overflow: 'hidden' }}>
      <div style={block}>
        <span style={title}>{t.habits.goal}</span>
        <Chips
          label={t.habits.lessonsPerDay}
          value={s?.daily_goal ?? 1}
          options={GOALS.map((g) => [g, `${g}`])}
          disabled={!s || save.isPending}
          onPick={(g) => {
            track('daily_goal_set', { goal: g })
            save.mutate({ daily_goal: g })
          }}
        />
        <span style={hint}>
          {t.habits.goalHint(s?.daily_goal ?? 1)}
        </span>
      </div>

      <div style={{ ...block, borderTop: '1.5px solid var(--bg-deep)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ ...title, flex: 1 }}>{t.habits.reminder}</span>
          {canPush && (
            <button
              type="button"
              role="switch"
              aria-checked={reminderOn}
              aria-label={t.habits.reminder}
              disabled={!s || reminder.isPending}
              onClick={() => reminder.mutate(!reminderOn)}
              style={{ border: 'none', width: 52, height: 32, borderRadius: 16, padding: 3, display: 'flex', flexShrink: 0, justifyContent: reminderOn ? 'flex-end' : 'flex-start', background: reminderOn ? 'var(--primary)' : 'var(--bg-deep)' }}
            >
              <span style={{ width: 26, height: 26, borderRadius: 13, background: '#fff' }} />
            </button>
          )}
        </span>
        {!s ? null : !canPush ? (
          <span style={hint}>
            {s.push_available ? t.habits.install : t.habits.unavailable}
          </span>
        ) : reminderOn ? (
          <>
            <Chips
              label={t.habits.hour}
              value={s.reminder_hour ?? 19}
              options={HOURS.map((h) => [h, t.habits.hourLabel(h)])}
              disabled={save.isPending}
              onPick={(h) => save.mutate({ reminder_hour: h, timezone: TZ, language: lang })}
            />
            <span style={hint}>{t.habits.skipDone}</span>
            <button type="button" onClick={() => test.mutate()} disabled={test.isPending} style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: '2px 0', fontSize: 14, fontWeight: 600, color: 'var(--primary)' }}>
              {test.isSuccess ? t.habits.testSent : test.isPending ? t.report.sending : t.habits.test}
            </button>
          </>
        ) : (
          <span style={hint}>{t.habits.reminderHint}</span>
        )}
        {pushError && <span role="alert" style={{ fontSize: 13, color: 'var(--rose-ink)', lineHeight: 1.4 }}>{pushError}</span>}
      </div>

      <div style={{ ...block, borderTop: '1.5px solid var(--bg-deep)' }}>
        <span style={title}>{t.habits.appearance}</span>
        <Chips
          label={t.habits.theme}
          value={theme}
          options={THEMES}
          onPick={(next) => {
            setThemeState(next)
            setTheme(next)
            track('theme_set', { theme: next })
          }}
        />
      </div>

      <div style={{ ...block, borderTop: '1.5px solid var(--bg-deep)' }}>
        <span style={title}>{t.habits.language}</span>
        <Chips
          label={t.habits.language}
          value={lang}
          options={LANGS}
          onPick={(next) => {
            if (next === lang) return
            track('language_set', { language: next })
            // Reminders are written in this language too; reload either way.
            void Api.saveSettings({ language: next }).catch(() => undefined).finally(() => setLang(next))
          }}
        />
      </div>
    </div>
  )
}
