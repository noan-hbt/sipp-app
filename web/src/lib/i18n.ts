/**
 * Every visible text lives in `locales/fr.ts` (the reference) and `locales/en.ts` (same keys, checked
 * by the compiler). `t` is the active language's texts.
 */
import { en } from '../locales/en'
import { fr } from '../locales/fr'
import { lang, LANG_KEY, type Lang } from './lang'

export { lang, plural, type Lang } from './lang'

/** For Intl (dates, numbers, plural rules). */
export const locale = lang === 'fr' ? 'fr-FR' : 'en-US'
export const t = lang === 'fr' ? fr : en

if (typeof document !== 'undefined') document.documentElement.lang = lang

/** Switches the interface language; the app reloads so every text follows. */
export function setLang(next: Lang) {
  try {
    localStorage.setItem(LANG_KEY, next)
  } catch {
    /* private mode: the choice lasts until reload only, so reload anyway */
  }
  window.location.reload()
}
