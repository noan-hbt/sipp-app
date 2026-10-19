import { t } from './i18n'
export const LESSON_MINUTES = 5

/** "≈ 45 min" / "≈ 1 h 15" (1h 15m in English) for a number of 5-minute lessons. */
export function duration(lessons: number) {
  const m = lessons * LESSON_MINUTES
  return `≈ ${t.time.minutes(m)}`
}
