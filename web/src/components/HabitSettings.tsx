import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Api, TZ, type Settings } from '../lib/api'
import { disablePush, enablePush, needsInstall, pushSupported } from '../lib/push'
import { track } from '../lib/telemetry'
import { getTheme, setTheme, type Theme } from '../lib/theme'

const GOALS = [1, 2, 3, 5]
const HOURS = [7, 8, 9, 12, 13, 18, 19, 20, 21, 22]
const THEMES: [Theme, string][] = [['system', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']]

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
      await enablePush(s.push_public_key!)
      track('reminder_enabled', { hour: s.reminder_hour ?? 19 })
      return Api.saveSettings({ reminder_hour: s.reminder_hour ?? 19, timezone: TZ })
    },
    onSuccess: put,
    onError: (e) => {
      setPushError(
        e instanceof Error && e.message === 'denied'
          ? 'Les notifications sont bloquées. Autorise-les pour Sipp dans les réglages de ton appareil.'
          : 'Impossible d’activer les rappels sur cet appareil pour le moment.',
      )
    },
  })
  const test = useMutation({ mutationFn: Api.testPush })
  const s = settings.data
  const reminderOn = !!s && s.reminder_hour !== null && s.push_enabled
  const canPush = !!s?.push_public_key && pushSupported()

  return (
    <div className="card" style={{ borderRadius: 24, overflow: 'hidden' }}>
      <div style={block}>
        <span style={title}>Objectif du jour</span>
        <Chips
          label="Leçons par jour"
          value={s?.daily_goal ?? 1}
          options={GOALS.map((g) => [g, `${g}`])}
          disabled={!s || save.isPending}
          onPick={(g) => {
            track('daily_goal_set', { goal: g })
            save.mutate({ daily_goal: g })
          }}
        />
        <span style={hint}>
          {(s?.daily_goal ?? 1) === 1 ? 'Une leçon par jour, environ 5 minutes.' : `${s?.daily_goal} leçons par jour, environ ${(s?.daily_goal ?? 1) * 5} minutes.`}{' '}
          Ta série avance dès la première.
        </span>
      </div>

      <div style={{ ...block, borderTop: '1.5px solid var(--bg-deep)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ ...title, flex: 1 }}>Rappel quotidien</span>
          {canPush && (
            <button
              type="button"
              role="switch"
              aria-checked={reminderOn}
              aria-label="Rappel quotidien"
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
            {s.push_public_key && needsInstall()
              ? 'Sur iPhone, ajoute d’abord Sipp à ton écran d’accueil (Partager → Sur l’écran d’accueil) pour recevoir des rappels.'
              : 'Les rappels ne sont pas disponibles sur cet appareil.'}
          </span>
        ) : reminderOn ? (
          <>
            <Chips
              label="Heure du rappel"
              value={s.reminder_hour ?? 19}
              options={HOURS.map((h) => [h, `${h} h`])}
              disabled={save.isPending}
              onPick={(h) => save.mutate({ reminder_hour: h, timezone: TZ })}
            />
            <span style={hint}>Pas de rappel les jours où tu as déjà fait ta leçon.</span>
            <button type="button" onClick={() => test.mutate()} disabled={test.isPending} style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: '2px 0', fontSize: 14, fontWeight: 600, color: 'var(--primary)' }}>
              {test.isSuccess ? 'Envoyé, regarde tes notifications' : test.isPending ? 'Envoi…' : 'M’envoyer un essai'}
            </button>
          </>
        ) : (
          <span style={hint}>Un petit mot à l’heure de ton choix pour ne pas casser ta série.</span>
        )}
        {pushError && <span role="alert" style={{ fontSize: 13, color: 'var(--rose-ink)', lineHeight: 1.4 }}>{pushError}</span>}
      </div>

      <div style={{ ...block, borderTop: '1.5px solid var(--bg-deep)' }}>
        <span style={title}>Apparence</span>
        <Chips
          label="Thème"
          value={theme}
          options={THEMES}
          onPick={(t) => {
            setThemeState(t)
            setTheme(t)
            track('theme_set', { theme: t })
          }}
        />
      </div>
    </div>
  )
}
