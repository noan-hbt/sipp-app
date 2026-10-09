// Errors (Sentry) and product analytics (PostHog), both off until their key is set at build time.
// Loaded lazily so they never weigh on the first paint. Users are known by id only, never by email,
// and no lesson answer or free text is ever sent.
import { getTokens, onTokens } from './api'

type PostHog = typeof import('posthog-js').default
type Sentry = typeof import('@sentry/react')

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com'

let posthog: PostHog | null = null
let sentry: Sentry | null = null
const pending: [string, Record<string, unknown> | undefined][] = []

function userId(): string | null {
  const token = getTokens()?.access_token
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

let knownUser: string | null = null
function syncUser() {
  const id = userId()
  if (id === knownUser) return
  knownUser = id
  if (id) {
    posthog?.identify(id)
    sentry?.setUser({ id })
  } else {
    posthog?.reset()
    sentry?.setUser(null)
  }
}

export function initTelemetry() {
  if (SENTRY_DSN) {
    void import('@sentry/react').then((S) => {
      S.init({
        dsn: SENTRY_DSN,
        environment: import.meta.env.MODE,
        integrations: [S.browserTracingIntegration()],
        tracesSampleRate: 0.1,
      })
      sentry = S
      knownUser = null
      syncUser()
    })
  }
  if (POSTHOG_KEY) {
    void import('posthog-js').then(({ default: ph }) => {
      ph.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        capture_pageview: 'history_change',
        capture_pageleave: true,
        autocapture: false, // clicks could carry lesson text
        disable_session_recording: true,
        person_profiles: 'identified_only',
        persistence: 'localStorage',
        mask_all_text: true,
        mask_all_element_attributes: true,
      })
      posthog = ph
      knownUser = null
      syncUser()
      for (const [event, props] of pending.splice(0)) ph.capture(event, props)
    })
  }
  onTokens(syncUser)
}

/** A product event. Props must stay small and never hold user text. */
export function track(event: string, props?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return
  if (posthog) posthog.capture(event, props)
  else if (pending.length < 50) pending.push([event, props])
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  sentry?.captureException(error, context ? { extra: context } : undefined)
}
