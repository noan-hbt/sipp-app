/**
 * Synthesized UI sounds (Web Audio, no assets). Soft, short, warm: sine/triangle
 * tones with quick envelopes. Respects a persisted mute setting.
 */

type SoundName = 'tap' | 'pop' | 'reveal' | 'correct' | 'wrong' | 'star' | 'complete' | 'unlock' | 'whoosh'

const KEY = 'sipp.sound'
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
})()
let ctx: AudioContext | null = null
let master: GainNode | null = null

function audio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.4
    // Warm everything up: roll off harsh highs.
    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 1800
    lowpass.Q.value = 0.5
    master.connect(lowpass).connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number } = {}) {
  const c = audio()
  if (!c || !master) return
  const t = c.currentTime + start
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur)
  const peak = opts.gain ?? 0.5
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function noise(start: number, dur: number, gain = 0.12) {
  const c = audio()
  if (!c || !master) return
  const t = c.currentTime + start
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const src = c.createBufferSource()
  src.buffer = buf
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(400, t)
  filter.frequency.exponentialRampToValueAtTime(1400, t + dur)
  const g = c.createGain()
  g.gain.value = gain
  src.connect(filter).connect(g).connect(master)
  src.start(t)
}

// One octave lower than a typical UI kit: rounder, less piercing.
const A3 = 220, C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392, C5 = 523.25, E5 = 659.25

const SOUNDS: Record<SoundName, () => void> = {
  tap: () => tone(360, 0, 0.06, { type: 'sine', gain: 0.22, to: 280 }),
  pop: () => tone(260, 0, 0.11, { type: 'sine', gain: 0.4, to: 440 }),
  reveal: () => tone(330, 0, 0.14, { type: 'sine', gain: 0.16, to: 420 }),
  correct: () => {
    tone(E4, 0, 0.16, { type: 'triangle', gain: 0.38 })
    tone(C5, 0.1, 0.3, { type: 'triangle', gain: 0.34 })
  },
  wrong: () => {
    tone(D4, 0, 0.18, { type: 'sine', gain: 0.34, to: 247 })
    tone(A3, 0.13, 0.26, { type: 'sine', gain: 0.28, to: 196 })
  },
  star: () => {
    tone(E5, 0, 0.2, { type: 'sine', gain: 0.2 })
    tone(G4 * 2, 0.05, 0.26, { type: 'sine', gain: 0.14 })
  },
  complete: () => {
    ;[C4, E4, G4, C5].forEach((f, i) => tone(f, i * 0.1, 0.36, { type: 'triangle', gain: 0.34 }))
  },
  unlock: () => {
    tone(G4, 0, 0.12, { type: 'triangle', gain: 0.3 })
    tone(C5, 0.09, 0.26, { type: 'triangle', gain: 0.28 })
  },
  whoosh: () => noise(0, 0.24, 0.09),
}


export function play(name: SoundName) {
  if (!enabled) return
  try {
    SOUNDS[name]()
  } catch {
    /* audio unavailable */
  }
}

export function soundEnabled() {
  return enabled
}
export function setSoundEnabled(v: boolean) {
  enabled = v
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off')
  } catch {
    /* ignore */
  }
  if (v) play('pop')
}

/** Light haptic tick where supported (Android). iOS Safari ignores it. */
export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* ignore */
  }
}
