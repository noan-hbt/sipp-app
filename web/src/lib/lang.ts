/** Interface language, read once at startup: the one chosen in the profile, else the device's (French when it starts with "fr", English otherwise). */

export type Lang = 'fr' | 'en'

export const LANG_KEY = 'sipp.lang'

function detect(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'fr' || saved === 'en') return saved
  } catch {
    /* private mode: fall back to the device language */
  }
  const device = typeof navigator === 'undefined' ? '' : (navigator.languages?.[0] ?? navigator.language ?? '')
  return device.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export const lang: Lang = detect()

/** "1 leçon" / "3 leçons": picks the form by count (0 is singular in French, plural in English). */
export const plural = (n: number, one: string, many: string) => (n === 1 || (lang === 'fr' && n === 0) ? one : many)
