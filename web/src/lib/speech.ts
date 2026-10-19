import { lang, locale } from './i18n'
/** Lessons read aloud with the device's own voice, in the lesson's language (else the app's): free, offline, no server. */

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

function voiceFor(language: string, tag: string) {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(language))
  // Prefer the natural-sounding voices some systems ship.
  return voices.find((v) => /natural|neural|premium|enhanced|google/i.test(v.name)) ?? voices.find((v) => v.lang === tag) ?? voices[0]
}

/** Reads the text, sentence by sentence (long utterances get cut on some browsers). `language`: ISO 639-1 of the text. */
export function speak(text: string, onEnd?: () => void, language: string = lang) {
  if (!speechSupported()) return
  const synth = window.speechSynthesis
  synth.cancel()
  const sentences = text.match(/[^.!?…]+[.!?…]*/g)?.map((s) => s.trim()).filter(Boolean) ?? []
  if (!sentences.length) {
    onEnd?.()
    return
  }
  const code = language.toLowerCase().slice(0, 2)
  // The app's own locale when it matches ("fr-FR"), else the bare code ("it") and the device picks the region.
  const tag = code === lang ? locale : code
  const voice = voiceFor(code, tag)
  sentences.forEach((s, i) => {
    const u = new SpeechSynthesisUtterance(s)
    u.lang = tag
    if (voice) u.voice = voice
    u.rate = 1.02
    if (i === sentences.length - 1 && onEnd) u.onend = () => onEnd()
    synth.speak(u)
  })
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel()
}
