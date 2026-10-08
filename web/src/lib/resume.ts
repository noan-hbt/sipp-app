import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { Api, getSessionId, getSessionUserId, onSessionChange, onTokens, type LessonOut } from './api'

type Resume = NonNullable<LessonOut['resume']>
type State = { status: 'saved' | 'saving' | 'error'; error: unknown; durable: boolean }
const queues = new Map<string, ReturnType<typeof createQueue>>()
onSessionChange(() => queues.clear())

function createQueue(lessonId: string, session: string, userId: string | null) {
  const key = `sipp.resume.${userId}.${lessonId}`
  let pending: Resume | null = null
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (stored && Number.isInteger(stored.step) && stored.step >= 0 && Array.isArray(stored.answers)) pending = stored
  } catch {
    /* private mode */
  }
  let latest = pending
  let running: Promise<void> | null = null
  let paused = false
  let state: State = { status: pending ? 'saving' : 'saved', error: null, durable: true }
  const listeners = new Set<() => void>()
  const current = () => userId !== null && getSessionId() === session && getSessionUserId() === userId
  const publish = (next: State) => {
    state = next
    listeners.forEach((l) => l())
  }

  function retry(): Promise<void> {
    if (running || paused || !pending || !current()) return running ?? Promise.resolve()
    publish({ ...state, status: 'saving', error: null })
    running = (async () => {
      while (pending && !paused && current()) {
        const resume: Resume = pending
        try {
          await Api.saveResume(lessonId, resume)
        } catch (error) {
          if (current()) publish({ ...state, status: 'error', error })
          return
        }
        if (!current()) return
        if (pending === resume) {
          pending = null
          try {
            localStorage.removeItem(key)
          } catch {
            /* private mode */
          }
        }
      }
      if (current()) publish({ ...state, status: pending ? 'saving' : 'saved', error: null })
    })().finally(() => {
      running = null
      if (pending && !paused && current() && state.status !== 'error') void retry()
    })
    return running
  }

  return {
    get resume() { return latest },
    snapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    save(resume: Resume) {
      latest = pending = resume
      let durable = true
      try {
        localStorage.setItem(key, JSON.stringify(resume))
      } catch {
        durable = false
      }
      publish({ status: 'saving', error: null, durable })
      void retry()
    },
    retry,
    async pause() {
      paused = true
      await running
    },
    unpause() {
      paused = false
      void retry()
    },
    clear() {
      latest = pending = null
      if (current()) {
        try {
          localStorage.removeItem(key)
        } catch {
          /* private mode */
        }
      }
      publish({ ...state, status: 'saved', error: null })
    },
  }
}

export function useLessonResume(lessonId: string) {
  const session = useSyncExternalStore(onTokens, getSessionId)
  const queue = useMemo(() => {
    const key = `${session}:${lessonId}`
    let entry = queues.get(key)
    if (!entry) {
      entry = createQueue(lessonId, session, getSessionUserId())
      queues.set(key, entry)
    }
    return entry
  }, [lessonId, session])
  const state = useSyncExternalStore(queue.subscribe, queue.snapshot)
  useEffect(() => {
    void queue.retry()
    const retry = () => void queue.retry()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [queue])
  return { queue, state }
}
