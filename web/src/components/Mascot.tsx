import { motion } from 'motion/react'

export type Mood = 'hello' | 'think' | 'oops' | 'bravo'

const eyeStyle = (delay: number): React.CSSProperties => ({
  transformBox: 'fill-box',
  transformOrigin: 'center',
  animation: `blink 4.2s ${delay}s infinite`,
})
const steamStyle = (delay: number): React.CSSProperties => ({
  transformBox: 'fill-box',
  transformOrigin: 'bottom',
  animation: `steam 2.4s ${delay}s ease-in-out infinite`,
})

/** Sipp, the cup. Steam acts as expressive "hair". */
export function Mascot({ mood = 'hello', size = 80, bob = true }: { mood?: Mood; size?: number; bob?: boolean }) {
  return (
    <motion.svg
      key={mood}
      width={size}
      height={size}
      viewBox="0 0 80 80"
      aria-hidden="true"
      initial={{ scale: 0.82, rotate: mood === 'oops' ? -6 : 0 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 14 }}
      style={{ overflow: 'visible', animation: bob ? 'bob 3s ease-in-out infinite' : undefined }}
    >
      {mood === 'hello' && (
        <g stroke="#C9BCA8" strokeWidth="3" fill="none" strokeLinecap="round">
          <path d="M30 6c-3 4 3 6 0 10" style={steamStyle(0)} />
          <path d="M40 3c-3 4 3 6 0 10" style={steamStyle(0.4)} />
          <path d="M50 6c-3 4 3 6 0 10" style={steamStyle(0.8)} />
        </g>
      )}
      {mood === 'think' && (
        <g fill="#C9BCA8">
          {[
            [30, 11, 2.6],
            [40, 8, 3.2],
            [51, 5, 3.8],
          ].map(([cx, cy, r], i) => (
            <motion.circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </g>
      )}
      {mood === 'oops' && (
        <g stroke="#C9BCA8" strokeWidth="3" fill="none" strokeLinecap="round">
          <path d="M32 14c-4-3-1-7 2-9" />
          <path d="M45 14c4-3 1-7-2-9" />
        </g>
      )}
      {mood === 'bravo' && (
        <g>
          <motion.path
            d="M40 15c-6-4-8-9-4-11 2-1 4 1 4 3 0-2 2-4 4-3 4 2 2 7-4 11z"
            fill="#F28B8B"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ duration: 0.9, repeat: Infinity }}
          />
          <motion.path
            d="M22 8l1.5 3 3 1.5-3 1.5L22 17l-1.5-3-3-1.5 3-1.5zM58 6l1.2 2.4 2.4 1.2-2.4 1.2L58 13l-1.2-2.2-2.4-1.2 2.4-1.2z"
            fill="#F2C14E"
            animate={{ opacity: [0.4, 1, 0.4], rotate: [0, 12, 0] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        </g>
      )}

      <path d="M60 34h3a9 9 0 010 18h-3" stroke="#D9875A" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M14 24h48v26a20 20 0 01-20 20h-8a20 20 0 01-20-20z" fill="#F4A574" />
      <ellipse cx="38" cy="24" rx="24" ry="5.5" fill="#E8925F" />
      <ellipse cx="38" cy="24.5" rx="19" ry="3.6" fill="#8A5A3B" />
      <path d="M17 52a20 18 0 0042 0z" fill="#F8C29E" opacity=".7" />

      {mood === 'hello' && (
        <>
          <g style={eyeStyle(0)}>
            <ellipse cx="30" cy="40" rx="3.2" ry="4.2" fill="#2B2620" />
            <circle cx="31.1" cy="38.5" r="1.1" fill="#FFF" />
          </g>
          <g style={eyeStyle(0)}>
            <ellipse cx="46" cy="40" rx="3.2" ry="4.2" fill="#2B2620" />
            <circle cx="47.1" cy="38.5" r="1.1" fill="#FFF" />
          </g>
          <circle cx="23" cy="48" r="3.4" fill="#F28B8B" opacity=".55" />
          <circle cx="53" cy="48" r="3.4" fill="#F28B8B" opacity=".55" />
          <path d="M33 48q5 5 10 0" stroke="#2B2620" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </>
      )}
      {mood === 'think' && (
        <>
          <motion.g animate={{ x: [0, 2, 2, 0] }} transition={{ duration: 3, repeat: Infinity }}>
            <ellipse cx="32" cy="38" rx="3.2" ry="4.2" fill="#2B2620" />
            <ellipse cx="48" cy="38" rx="3.2" ry="4.2" fill="#2B2620" />
            <circle cx="33.2" cy="36.2" r="1.1" fill="#FFF" />
            <circle cx="49.2" cy="36.2" r="1.1" fill="#FFF" />
          </motion.g>
          <path d="M27 31l7-1.5M43 30.5l7 1.5" stroke="#2B2620" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M36 50h8" stroke="#2B2620" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
      {mood === 'oops' && (
        <>
          <ellipse cx="30" cy="41" rx="3.2" ry="4.2" fill="#2B2620" />
          <ellipse cx="46" cy="41" rx="3.2" ry="4.2" fill="#2B2620" />
          <path d="M25 33l8 2.5M51 33l-8 2.5" stroke="#2B2620" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M33 53q5-4 10 0" stroke="#2B2620" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <motion.path
            d="M58 30q2 5 0 7"
            stroke="#9FC9E8"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            animate={{ y: [0, 4], opacity: [1, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.6 }}
          />
        </>
      )}
      {mood === 'bravo' && (
        <>
          <path d="M25 41q4-5 8 0M41 41q4-5 8 0" stroke="#2B2620" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <circle cx="23" cy="48" r="3.4" fill="#F28B8B" opacity=".6" />
          <circle cx="53" cy="48" r="3.4" fill="#F28B8B" opacity=".6" />
          <path d="M31 47q7 9 14 0z" fill="#2B2620" />
          <motion.path
            d="M14 38l-7-5M62 30l6-6"
            stroke="#2B2620"
            strokeWidth="2.6"
            strokeLinecap="round"
            animate={{ rotate: [0, -8, 0] }}
            transition={{ duration: 0.6, repeat: Infinity }}
          />
        </>
      )}
    </motion.svg>
  )
}
