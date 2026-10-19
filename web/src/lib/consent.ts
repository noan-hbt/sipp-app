/** The visitor's answer about usage statistics (PostHog): asked once, changeable in the profile. */

export type Consent = 'granted' | 'denied'

const KEY = 'sipp.consent'
const listeners = new Set<() => void>()

export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    return null
  }
}

export function setConsent(value: Consent) {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    /* private mode: the answer lasts for this visit */
  }
  memory = value
  listeners.forEach((f) => f())
}

/** In private mode localStorage throws: the answer is kept in memory for the visit. */
let memory: Consent | null = null
export const currentConsent = () => getConsent() ?? memory

export function onConsent(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
