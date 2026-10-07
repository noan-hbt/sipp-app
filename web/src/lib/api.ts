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
  assumptions: string[]
}
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
}
export interface Stats {
  streak_days: number
  completed_today: boolean
  lessons_completed: number
  total_stars: number
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
  status: 'generating' | 'ready' | 'failed'
  error: string | null
  title: string | null
  summary: string | null
  lite: boolean
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

// --- Token storage ---

const KEY = 'sipp.tokens'
let tokens: Tokens | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
})()
const listeners = new Set<() => void>()

export function getTokens() {
  return tokens
}
export function setTokens(t: Tokens | null) {
  tokens = t
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode */
  }
  if (!t && typeof caches !== 'undefined') void caches.delete('sipp-api').catch(() => {})
  listeners.forEach((l) => l())
}
export function onTokens(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

let refreshing: Promise<boolean> | null = null
async function refresh(): Promise<boolean> {
  if (!tokens) return false
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: tokens!.refresh_token }),
      })
      if (!r.ok) {
        setTokens(null)
        return false
      }
      setTokens(await r.json())
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) headers.set('Content-Type', 'application/json')
  if (tokens) headers.set('Authorization', `Bearer ${tokens.access_token}`)
  const r = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  if (r.status === 401 && retry && tokens && !path.startsWith('/auth/login')) {
    if (await refresh()) return api<T>(path, init, false)
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
  return (r.status === 204 ? undefined : await r.json()) as T
}

export const Api = {
  register: (email: string, password: string) =>
    api<Tokens>('/auth/register', { method: 'POST', json: { email, password } }),
  login: (email: string, password: string) =>
    api<Tokens>('/auth/login', { method: 'POST', json: { email, password } }),
  logout: () =>
    tokens ? api<void>('/auth/logout', { method: 'POST', json: { refresh_token: tokens.refresh_token } }) : Promise.resolve(),
  stats: () => api<Stats>(`/auth/me/stats?tz=${encodeURIComponent(TZ)}`),
  deleteAccount: (password: string) => api<void>('/auth/me', { method: 'DELETE', json: { password } }),
  me: () => api<{ id: string; email: string; created_at: string }>('/auth/me'),
  plan: () => api<Plan>('/auth/me/plan'),
  startTrial: () => api<Plan>('/auth/me/trial', { method: 'POST' }),
  exportData: () => api<unknown>('/auth/me/export'),
  sips: () => api<SipSummary[]>('/sips'),
  sip: (id: string) => api<SipDetail>(`/sips/${id}`),
  createSip: (input: string) => api<SipSummary>('/sips', { method: 'POST', json: { input } }),
  retrySip: (id: string) => api<SipSummary>(`/sips/${id}/retry`, { method: 'POST' }),
  deleteSip: (id: string) => api<void>(`/sips/${id}`, { method: 'DELETE' }),
  programs: () => api<Program[]>('/programs'),
  program: (id: string) => api<Program>(`/programs/${id}`),
  deleteProgram: (id: string) => api<void>(`/programs/${id}`, { method: 'DELETE' }),
  startChapter: (id: string, position: number) => api<SipSummary>(`/programs/${id}/chapters/${position}`, { method: 'POST' }),
  extendSip: (id: string) => api<Program>(`/sips/${id}/extend`, { method: 'POST' }),
  lesson: (id: string) => api<LessonOut>(`/lessons/${id}`),
  complete: (id: string, body: { answers: unknown[]; score: { correct: number; total: number } }) =>
    api<CompleteOut>(`/lessons/${id}/complete?tz=${encodeURIComponent(TZ)}`, { method: 'POST', json: body }),
  saveResume: (id: string, body: { step: number; answers: unknown[] }) =>
    api<void>(`/lessons/${id}/resume`, { method: 'PUT', json: body }),
}
