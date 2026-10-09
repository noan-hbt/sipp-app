/** Lessons read aloud with the device's own French voice: free, offline, no server. */

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

function frenchVoice() {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('fr'))
  // Prefer the natural-sounding voices some systems ship.
  return voices.find((v) => /natural|neural|premium|enhanced|google/i.test(v.name)) ?? voices.find((v) => v.lang === 'fr-FR') ?? voices[0]
}

/** Reads the text, sentence by sentence (long utterances get cut on some browsers). */
export function speak(text: string, onEnd?: () => void) {
  if (!speechSupported()) return
  const synth = window.speechSynthesis
  synth.cancel()
  const sentences = text.match(/[^.!?…]+[.!?…]*/g)?.map((s) => s.trim()).filter(Boolean) ?? []
  if (!sentences.length) {
    onEnd?.()
    return
  }
  const voice = frenchVoice()
  sentences.forEach((s, i) => {
    const u = new SpeechSynthesisUtterance(s)
    u.lang = 'fr-FR'
    if (voice) u.voice = voice
    u.rate = 1.02
    if (i === sentences.length - 1 && onEnd) u.onend = () => onEnd()
    synth.speak(u)
  })
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel()
}
