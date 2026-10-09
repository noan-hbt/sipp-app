import type { Block } from './blocks'

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'
export const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

// --- Types (mirror backend/app/api/schemas.py) ---

export interface Tokens {
  access_token: string
  refresh_token: string
  expires_in: number
}
export interface Progress { completed: number; total: number }
export interface SipSummary {
  id: string
  title: string | null
  input_text: string
  status: 'queued' | 'generating' | 'ready' | 'failed'
  stage: string | null
  error: string | null
  progress: Progress
  next_lesson_id: string | null
  next_lesson_title?: string | null
  lite?: boolean
  program_id?: string | null
  chapter?: number | null
  created_at: string
}
export type LessonStatus = 'pending' | 'queued' | 'generating' | 'ready' | 'failed'
export interface LessonBrief {
  id: string
  key: string
  position: number
  title: string
  objective: string
  concepts: string[]
  prerequisites: string[]
  status: LessonStatus
  completed: boolean
  stars: number | null
}
export interface ModuleOut {
  id: string
  position: number
  title: string
  role: string
  objectives: string[]
  lessons: LessonBrief[]
  /** Stars earned once every lesson of the module is finished. */
  bonus_stars?: number
  bonus_earned?: boolean
}
export interface Profile {
  topic: string
  title: string
  language: string
  current_level: string
  level_details: { area: string; level: string }[]
  target_level: string
  goals: string[]
  depth: string
  scope: string
  breadth?: string
  prior_knowledge?: string[]
  context?: string | null
  assumptions: string[]
  out_of_scope?: string[]
}
export interface Interpretation {
  profile: Profile
  lessons_min: number
  lessons_max: number
  program: boolean
}
export interface Concept {
  id: string
  name: string
  definition: string
  explanation: string | null
  sip_id: string
  sip_title: string
  lesson_id: string
  lesson_title: string
  mastery: 1 | 2 | 3
  due: boolean
  learned_at: string
  last_reviewed_at: string | null
}
export interface ReviewSession { due_count: number; cards: Concept[] }
export type HelpKind = 'rephrase' | 'simpler' | 'example' | 'word' | 'question'
export interface SipDetail extends SipSummary {
  summary: string | null
  profile: Profile | null
  outline?: string[]
  modules: ModuleOut[]
}
export interface LessonOut {
  id: string
  sip_id: string
  module_id: string
  key: string
  title: string
  objective: string
  concepts: string[]
  status: LessonStatus
  error: string | null
  blocks: Block[] | null
  summary: string | null
  concepts_taught: string[] | null
  completed_at: string | null
  stars: number | null
  next_lesson_id: string | null
  resume?: { step: number; answers: unknown[] } | null
}
export interface CompleteOut {
  lesson_id: string
  next_lesson_id: string | null
  progress: Progress
  stars: number
  streak_days: number
  /** Bonus stars earned right now: this lesson finished its module. */
  module_bonus?: number
}
export interface Stats {
  streak_days: number
  completed_today: boolean
  lessons_completed: number
  total_stars: number
  week?: boolean[]
  month?: string
  month_days?: number[]
  today?: number
  concepts?: number
}
export interface Chapter {
  position: number
  title: string
  outcome: string
  level: 'core' | 'advanced'
  estimated_lessons: number
  sip: SipSummary | null
}
export interface Program {
  id: string
  status: 'generating' | 'adjusting' | 'ready' | 'failed'
  error: string | null
  title: string | null
  summary: string | null
  lite: boolean
  note?: string | null
  chapters: Chapter[]
  created_at: string
}
export interface Plan {
  plan: 'free' | 'basic' | 'plus' | 'max'
  on_trial: boolean
  plan_expires_at: string | null
  trial_available: boolean
  trial_days: number
  slots: number
  slots_used: number
  sips_per_month: number
  sips_this_month: number
  lite: boolean
}
export interface ApiErrorDetail { code?: string; message?: string }

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    const d = detail as ApiErrorDetail | string | undefined
    super(typeof d === 'string' ? d : d?.message ?? `HTTP ${status}`)
    this.status = status
    this.detail = detail
  }
  get code(): string | undefined {
    return typeof this.detail === 'object' && this.detail ? (this.detail as ApiErrorDetail).code : undefined
  }
}

export function apiErrorMessage(error: unknown, fallback = 'Impossible de joindre Sipp. Réessaie dans un instant.') {
  const messages: Record<string, string> = {
    no_free_slot: 'Ta bibliothèque est pleine. Libère une place pour réessayer.',
    monthly_limit: 'Tu as utilisé tes générations du mois. Réessaie le mois prochain.',
    daily_budget_reached: 'Tu as atteint ta limite du jour. Réessaie demain.',
    too_many_active_builds: 'Un Sip est déjà en préparation. Réessaie dans un instant.',
    program_adjusting: 'J’ajuste encore la suite de ton programme. Réessaie dans un instant.',
  }
  return error instanceof ApiError ? messages[error.code ?? ''] ?? fallback : fallback
}

// --- Token storage ---

const KEY = 'sipp.tokens'
const SESSION_KEY = 'sipp.session'
let tokens: Tokens | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
})()
const listeners = new Set<() => void>()
const sessionListeners = new Set<() => void>()
let sessionVersion = 0
let sessionController = new AbortController()
let sessionId = (() => {
  try {
    const id = localStorage.getItem(SESSION_KEY)
    if (tokens && id) return id
  } catch { /* private mode */ }
  const id = crypto.randomUUID()
  try { localStorage.setItem(SESSION_KEY, id) } catch { /* private mode */ }
  return id
})()
let cacheWork: Promise<unknown> = Promise.resolve()

function cacheTask<T>(task: () => Promise<T>): Promise<T> {
  const next = cacheWork.catch(() => {}).then(task)
  cacheWork = next
  return next
}

export function getSessionId() { return sessionId }
export function getSessionUserId(): string | null {
  try {
    const payload = tokens?.access_token.split('.')[1]
    if (!payload) return null
    const sub = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).sub
    return typeof sub === 'string' ? sub : null
  } catch { return null }
}
export function onSessionChange(l: () => void) {
  sessionListeners.add(l)
  return () => sessionListeners.delete(l)
}

export function getTokens() {
  return tokens
}
function storeTokens(t: Tokens | null) {
  tokens = t
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l())
}
export function setTokens(t: Tokens | null) {
  sessionVersion++
  sessionId = crypto.randomUUID()
  sessionController.abort()
  sessionController = new AbortController()
  refreshing = null
  tokens = t
  try { localStorage.setItem(SESSION_KEY, sessionId) } catch { /* private mode */ }
  if (typeof caches !== 'undefined') void cacheTask(() => caches.delete('sipp-api')).catch(() => {})
  sessionListeners.forEach((l) => l())
  storeTokens(t)
}
export function onTokens(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.key !== KEY && event.key !== null) return
  let next: Tokens | null = null
  let nextSession: string | null = null
  try {
    next = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    nextSession = localStorage.getItem(SESSION_KEY)
  } catch { /* private mode */ }
  if (nextSession === sessionId && next) {
    tokens = next
    listeners.forEach((l) => l())
    return
  }
  sessionVersion++
  sessionId = nextSession ?? crypto.randomUUID()
  sessionController.abort()
  sessionController = new AbortController()
  refreshing = null
  tokens = next
  if (typeof caches !== 'undefined') void cacheTask(() => caches.delete('sipp-api')).catch(() => {})
  sessionListeners.forEach((l) => l())
  listeners.forEach((l) => l())
})

let refreshing: { version: number; promise: Promise<boolean> } | null = null
async function refresh(): Promise<boolean> {
  if (!tokens) return false
  const version = sessionVersion
  if (refreshing?.version === version) return refreshing.promise
  const refreshToken = tokens.refresh_token
  const promise = (async () => {
    try {
      const r = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: sessionController.signal,
      })
      if (version !== sessionVersion) return false
      if (!r.ok) {
        setTokens(null)
        return false
      }
      const next = await r.json()
      if (version !== sessionVersion) return false
      storeTokens(next)
      return true
    } catch {
      return false
    } finally {
      if (refreshing?.version === version) refreshing = null
    }
  })()
  refreshing = { version, promise }
  return promise
}

/** AbortSignal.any is missing before iOS 17.4. */
function anySignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b])
  const c = new AbortController()
  const abort = () => c.abort()
  if (a.aborted || b.aborted) c.abort()
  a.addEventListener('abort', abort, { once: true })
  b.addEventListener('abort', abort, { once: true })
  return c.signal
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const version = sessionVersion
  const signal = init.signal ? anySignal(init.signal, sessionController.signal) : sessionController.signal
  const headers = new Headers(init.headers)
  if (init.json !== undefined) headers.set('Content-Type', 'application/json')
  if (tokens) headers.set('Authorization', `Bearer ${tokens.access_token}`)
  const privateRead = tokens && (!init.method || init.method === 'GET')
    && /^\/(sips(?:\/|$)|lessons\/|auth\/me(?:\/|$))/.test(path)
  const cacheable = privateRead && !/^\/auth\/me\/export(?:\/|\?|$)/.test(path)
  const cacheUrl = new URL(`${API_URL}${path}`)
  cacheUrl.searchParams.set('__sipp_session', sessionId)
  let r: Response
  try {
    // Older service workers must also receive a URL specific to this session.
    r = await fetch(privateRead ? cacheUrl.href : `${API_URL}${path}`, {
      ...init,
      headers,
      signal,
      cache: 'no-store',
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    })
  } catch (error) {
    if (signal.aborted || version !== sessionVersion) throw new DOMException('Session terminée', 'AbortError')
    const cached = cacheable && typeof caches !== 'undefined'
      ? await cacheTask(async () => {
        const cache = await caches.open('sipp-api')
        const response = await cache.match(cacheUrl.href)
        if (response && Date.now() - Number(response.headers.get('X-Sipp-Cached-At')) < 30 * 24 * 60 * 60 * 1000) return response
        await cache.delete(cacheUrl.href)
        return undefined
      }).catch(() => undefined)
      : undefined
    if (!cached) throw error
    r = cached
  }
  if (signal.aborted || version !== sessionVersion) throw new DOMException('Session terminée', 'AbortError')
  if (r.status === 401 && retry && tokens && !path.startsWith('/auth/login')) {
    const refreshed = await refresh()
    if (signal.aborted || version !== sessionVersion) throw new DOMException('Session terminée', 'AbortError')
    if (refreshed) return api<T>(path, init, false)
  }
  if (!r.ok) {
    let detail: unknown
    try {
      detail = (await r.json()).detail
    } catch {
      detail = undefined
    }
    throw new ApiError(r.status, detail)
  }
  if (cacheable && r.status === 200 && typeof caches !== 'undefined') {
    const cachedHeaders = new Headers(r.headers)
    cachedHeaders.set('X-Sipp-Cached-At', String(Date.now()))
    const copy = new Response(r.clone().body, { status: r.status, statusText: r.statusText, headers: cachedHeaders })
    void cacheTask(async () => {
      if (version !== sessionVersion || signal.aborted) return
      const cache = await caches.open('sipp-api')
      if (version !== sessionVersion || signal.aborted) return
      await cache.put(cacheUrl.href, copy)
      const keys = await cache.keys()
      for (const key of keys.slice(0, Math.max(0, keys.length - 200))) await cache.delete(key)
    }).catch(() => {})
  }
  const data = r.status === 204 ? undefined : await r.json()
  if (signal.aborted || version !== sessionVersion) throw new DOMException('Session terminée', 'AbortError')
  return data as T
}

export const Api = {
  register: (email: string, password: string) =>
    api<Tokens>('/auth/register', { method: 'POST', json: { email, password } }),
  login: (email: string, password: string) =>
    api<Tokens>('/auth/login', { method: 'POST', json: { email, password } }),
  logout: () => {
    const previous = tokens
    setTokens(null)
    return previous ? api<void>('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${previous.access_token}` }, json: { refresh_token: previous.refresh_token } }, false) : Promise.resolve()
  },
  stats: ({ signal }: { signal?: AbortSignal } = {}) => api<Stats>(`/auth/me/stats?tz=${encodeURIComponent(TZ)}`, { signal }),
  deleteAccount: (password: string) => api<void>('/auth/me', { method: 'DELETE', json: { password } }),
  me: ({ signal }: { signal?: AbortSignal } = {}) => api<{ id: string; email: string; created_at: string }>('/auth/me', { signal }),
  plan: ({ signal }: { signal?: AbortSignal } = {}) => api<Plan>('/auth/me/plan', { signal }),
  startTrial: () => api<Plan>('/auth/me/trial', { method: 'POST' }),
  plans: () => api<{ name: Plan['plan']; slots: number; sips_per_month: number; lite: boolean; hours_per_month: number }[]>('/auth/plans'),
  exportData: () => api<unknown>('/auth/me/export'),
  sips: ({ signal }: { signal?: AbortSignal } = {}) => api<SipSummary[]>('/sips', { signal }),
  sip: (id: string, signal?: AbortSignal) => api<SipDetail>(`/sips/${id}`, { signal }),
  createSip: (input: string, profile?: Profile) => api<SipSummary>('/sips', { method: 'POST', json: { input, profile } }),
  interpret: (input: string) => api<Interpretation>('/sips/interpret', { method: 'POST', json: { input } }),
  concepts: ({ signal }: { signal?: AbortSignal } = {}) => api<Concept[]>('/me/concepts', { signal }),
  review: ({ signal }: { signal?: AbortSignal } = {}) => api<ReviewSession>('/me/review', { signal }),
  reviewCard: (id: string, knew: boolean) => api<Concept>(`/me/review/${id}`, { method: 'POST', json: { knew } }),
  help: (lessonId: string, body: { block: number; kind: HelpKind; question?: string }) =>
    api<{ answer: string }>(`/lessons/${lessonId}/help`, { method: 'POST', json: body }),
  retrySip: (id: string) => api<SipSummary>(`/sips/${id}/retry`, { method: 'POST' }),
  deleteSip: (id: string) => api<void>(`/sips/${id}`, { method: 'DELETE' }),
  programs: ({ signal }: { signal?: AbortSignal } = {}) => api<Program[]>('/programs', { signal }),
  program: (id: string, signal?: AbortSignal) => api<Program>(`/programs/${id}`, { signal }),
  deleteProgram: (id: string) => api<void>(`/programs/${id}`, { method: 'DELETE' }),
  startChapter: (id: string, position: number) => api<SipSummary>(`/programs/${id}/chapters/${position}`, { method: 'POST' }),
  extendSip: (id: string) => api<Program>(`/sips/${id}/extend`, { method: 'POST' }),
  lesson: (id: string, signal?: AbortSignal) => api<LessonOut>(`/lessons/${id}`, { signal }),
  complete: (id: string, body: { answers: unknown[]; score: { correct: number; total: number } }) =>
    api<CompleteOut>(`/lessons/${id}/complete?tz=${encodeURIComponent(TZ)}`, { method: 'POST', json: body }),
  saveResume: (id: string, body: { step: number; answers: unknown[] }) =>
    api<void>(`/lessons/${id}/resume`, { method: 'PUT', json: body }),
}
