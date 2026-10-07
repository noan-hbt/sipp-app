import { motion } from 'motion/react'
import type { CSSProperties } from 'react'

export type Mood = 'hello' | 'think' | 'oops' | 'bravo'

const INK = '#1D1A17'
const STEAM = '#F2B48E'

const blink: CSSProperties = { transformBox: 'fill-box', transformOrigin: 'center', animation: 'blink 4.6s infinite' }
const steam = (delay: number): CSSProperties => ({
  transformBox: 'fill-box',
  transformOrigin: 'bottom',
  animation: `steam 2.8s ${delay}s ease-in-out infinite`,
})

function Eye({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g style={blink}>
      <circle cx={cx} cy={cy} r="3.6" fill={INK} />
    </g>
  )
}

/**
 * Sipp, the cup. Flat caramel mug with a cream rim and expressive steam.
 * Idle life = steam + blinking only (no bobbing).
 */
export function Mascot({ mood = 'hello', size = 80 }: { mood?: Mood; size?: number }) {
  return (
    <motion.svg
      key={mood}
      width={size}
      height={size}
      viewBox="0 0 80 80"
      aria-hidden="true"
      initial={{ scale: 0.86, rotate: mood === 'oops' ? -5 : 0 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 16 }}
      style={{ overflow: 'visible' }}
    >
      {/* steam / expression above the cup */}
      {mood === 'hello' && (
        <g stroke={STEAM} strokeWidth="3.2" fill="none" strokeLinecap="round">
          <path d="M31 8c-3 3.5 3 5.5 0 9.5" style={steam(0)} />
          <path d="M39.5 4.5c-3 3.5 3 5.5 0 9.5" style={steam(0.5)} />
          <path d="M48 8c-3 3.5 3 5.5 0 9.5" style={steam(1)} />
        </g>
      )}
      {mood === 'think' &&
        [
          [31, 13, 2.4],
          [39.5, 9.5, 3],
          [48.5, 6, 3.6],
        ].map(([cx, cy, r], i) => (
          <motion.circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill={STEAM}
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -1.5, 0] }}
            transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.22 }}
          />
        ))}
      {mood === 'oops' && (
        <g stroke={STEAM} strokeWidth="3.2" fill="none" strokeLinecap="round">
          <path d="M33 16c-4-3-1.5-6.5 1.5-8.5" />
          <path d="M46 16c4-3 1.5-6.5-1.5-8.5" />
        </g>
      )}
      {mood === 'bravo' && (
        <>
          <motion.path
            d="M39.5 4l1.8 3.6 3.6 1.8-3.6 1.8-1.8 3.6-1.8-3.6-3.6-1.8 3.6-1.8z"
            fill="#FFC93D"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            animate={{ scale: [1, 1.2, 1], rotate: [0, 15, 0] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          <motion.path
            d="M23 9l1.4 2.8 2.8 1.4-2.8 1.4L23 17.4l-1.4-2.8-2.8-1.4 2.8-1.4zM57 7l1.1 2.2 2.2 1.1-2.2 1.1L57 13.6l-1.1-2.2-2.2-1.1 2.2-1.1z"
            fill="#FFC93D"
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </>
      )}

      {/* handle */}
      <path d="M59 35c9 0 11.5 4 11.5 9.5S68 54 59 54" stroke="#B8471A" strokeWidth="6.5" fill="none" strokeLinecap="round" />
      {/* body + flat shade */}
      <path d="M16 27h46v22c0 13.5-9.5 23-23 23S16 62.5 16 49z" fill="#D9622B" />
      <path d="M48 27h14v22c0 13.5-9.5 23-23 23h-3c11-2 17-10 17-21z" fill="#B8471A" opacity=".45" />
      {/* cream rim */}
      <rect x="13.5" y="22.5" width="51" height="8" rx="4" fill="#FFF4EA" />

      {/* faces */}
      {mood === 'hello' && (
        <>
          <Eye cx={31} cy={43} />
          <Eye cx={47} cy={43} />
          <circle cx="24.5" cy="51" r="3.6" fill="#FF9C86" />
          <circle cx="53.5" cy="51" r="3.6" fill="#FF9C86" />
          <path d="M35.5 50.5q3.5 3.4 7 0" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      )}
      {mood === 'think' && (
        <>
          <motion.g animate={{ x: [0, 1.8, 1.8, 0] }} transition={{ duration: 3.2, repeat: Infinity }}>
            <Eye cx={32.5} cy={42} />
            <Eye cx={48.5} cy={42} />
          </motion.g>
          {/* curious, not worried: one brow raised, small content smile, warm cheeks */}
          <path d="M28 34.6q3.5-1.6 7 0M44.5 31.6q3.5-1.9 7-0.2" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <circle cx="25" cy="51" r="3.4" fill="#FF9C86" />
          <circle cx="54" cy="51" r="3.4" fill="#FF9C86" />
          <path d="M36.5 51.2q3 2.2 6.5 0.2" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      )}
      {mood === 'oops' && (
        <>
          <ellipse cx="31" cy="44" rx="3.5" ry="4.5" fill={INK} />
          <ellipse cx="47" cy="44" rx="3.5" ry="4.5" fill={INK} />
          <path d="M26 36.5l7.5 2.4M52 36.5l-7.5 2.4" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M35 54q4-3.4 8 0" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <motion.path
            d="M59.5 31q2 4.5 0 6.5"
            stroke="#9FC9E8"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            animate={{ y: [0, 4], opacity: [1, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.7 }}
          />
        </>
      )}
      {mood === 'bravo' && (
        <>
          <path d="M26.5 44q4.5-5 9 0M42.5 44q4.5-5 9 0" stroke={INK} strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <circle cx="24" cy="51" r="3.8" fill="#FF9C86" />
          <circle cx="54" cy="51" r="3.8" fill="#FF9C86" />
          <path d="M33 49.5q6 8.5 12 0z" fill={INK} />
          <path d="M36 52.6q3 1.9 6 0" stroke="#F28B8B" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </motion.svg>
  )
}
