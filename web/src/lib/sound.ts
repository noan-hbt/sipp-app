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
    master.gain.value = 0.32
    master.connect(ctx.destination)
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
  filter.frequency.setValueAtTime(600, t)
  filter.frequency.exponentialRampToValueAtTime(2400, t + dur)
  const g = c.createGain()
  g.gain.value = gain
  src.connect(filter).connect(g).connect(master)
  src.start(t)
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, A4 = 440, D5 = 587.33

const SOUNDS: Record<SoundName, () => void> = {
  tap: () => tone(880, 0, 0.05, { type: 'triangle', gain: 0.18, to: 660 }),
  pop: () => tone(520, 0, 0.09, { gain: 0.35, to: 900 }),
  reveal: () => tone(700, 0, 0.12, { type: 'triangle', gain: 0.12, to: 980 }),
  correct: () => {
    tone(E5, 0, 0.14, { type: 'triangle', gain: 0.4 })
    tone(C6, 0.09, 0.28, { type: 'triangle', gain: 0.38 })
  },
  wrong: () => {
    tone(D5, 0, 0.16, { type: 'sine', gain: 0.32, to: 440 })
    tone(A4, 0.12, 0.22, { type: 'sine', gain: 0.26, to: 370 })
  },
  star: () => {
    tone(G5 * 1.5, 0, 0.18, { type: 'sine', gain: 0.22 })
    tone(C6 * 1.5, 0.04, 0.25, { type: 'sine', gain: 0.16 })
  },
  complete: () => {
    ;[C5, E5, G5, C6].forEach((f, i) => tone(f, i * 0.09, 0.32, { type: 'triangle', gain: 0.34 }))
  },
  unlock: () => {
    tone(G5, 0, 0.1, { type: 'triangle', gain: 0.3 })
    tone(C6, 0.08, 0.22, { type: 'triangle', gain: 0.3 })
  },
  whoosh: () => noise(0, 0.22, 0.1),
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
