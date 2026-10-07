export const LESSON_MINUTES = 5

/** "≈ 45 min" / "≈ 1 h 15" for a number of 5-minute lessons. */
export function duration(lessons: number) {
  const m = lessons * LESSON_MINUTES
  if (m < 60) return `≈ ${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return `≈ ${h} h${r ? ` ${String(r).padStart(2, '0')}` : ''}`
}
