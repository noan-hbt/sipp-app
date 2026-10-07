import { motion } from 'motion/react'
import type { CSSProperties } from 'react'

export type Mood = 'hello' | 'think' | 'oops' | 'bravo'

const INK = '#2B2620'
const STEAM = '#C8C0B4'

const blink: CSSProperties = { transformBox: 'fill-box', transformOrigin: 'center', animation: 'blink 4.6s infinite' }
const steam = (delay: number): CSSProperties => ({
  transformBox: 'fill-box',
  transformOrigin: 'bottom',
  animation: `steam 2.8s ${delay}s ease-in-out infinite`,
})

function Eye({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g style={blink}>
      <ellipse cx={cx} cy={cy} rx="3.7" ry="4.7" fill={INK} />
      <circle cx={cx + 1.3} cy={cy - 1.7} r="1.35" fill="#FFF" />
      <circle cx={cx - 1.2} cy={cy + 1.6} r="0.6" fill="#FFF" opacity=".8" />
    </g>
  )
}

/**
 * Sipp, the cup. Ceramic peach mug with a cream lip, coffee surface and
 * expressive steam. Idle life = steam + blinking only (no bobbing).
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
            fill="#F2C14E"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            animate={{ scale: [1, 1.2, 1], rotate: [0, 15, 0] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          <motion.path
            d="M23 9l1.4 2.8 2.8 1.4-2.8 1.4L23 17.4l-1.4-2.8-2.8-1.4 2.8-1.4zM57 7l1.1 2.2 2.2 1.1-2.2 1.1L57 13.6l-1.1-2.2-2.2-1.1 2.2-1.1z"
            fill="#F2C14E"
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </>
      )}

      {/* soft contact shadow */}
      <ellipse cx="39" cy="75.5" rx="19" ry="2.6" fill={INK} opacity=".07" />
      {/* handle */}
      <path d="M59 35c9 0 11.5 4 11.5 9.5S68 54 59 54" stroke="#DE8A56" strokeWidth="6.5" fill="none" strokeLinecap="round" />
      {/* body */}
      <path d="M16 27h46v22c0 13.5-9.5 23-23 23S16 62.5 16 49z" fill="#F4A574" />
      <path d="M16 49c0 13.5 9.5 23 23 23s23-9.5 23-23v-3c0 13.5-9.5 21-23 21S16 59.5 16 46z" fill="#E8925F" opacity=".45" />
      {/* gloss */}
      <path d="M19.8 33v9.5c0 3.8 1 6.8 2.6 9" stroke="#FFF" strokeOpacity=".42" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* ceramic lip + coffee */}
      <ellipse cx="39" cy="27" rx="23" ry="5.4" fill="#FCEDE0" />
      <ellipse cx="39" cy="27.6" rx="18.6" ry="3.5" fill="#7A4E33" />

      {/* faces */}
      {mood === 'hello' && (
        <>
          <Eye cx={31} cy={43} />
          <Eye cx={47} cy={43} />
          <circle cx="24.5" cy="51" r="3.6" fill="#F07F7F" opacity=".42" />
          <circle cx="53.5" cy="51" r="3.6" fill="#F07F7F" opacity=".42" />
          <path d="M35.5 50.5q3.5 3.4 7 0" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      )}
      {mood === 'think' && (
        <>
          <motion.g animate={{ x: [0, 1.8, 1.8, 0] }} transition={{ duration: 3.2, repeat: Infinity }}>
            <Eye cx={32.5} cy={42} />
            <Eye cx={48.5} cy={42} />
          </motion.g>
          <path d="M27.5 34.5l7-1.4M44 33.1l7 1.4" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M37 52h6" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
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
          <circle cx="24" cy="51" r="3.8" fill="#F07F7F" opacity=".5" />
          <circle cx="54" cy="51" r="3.8" fill="#F07F7F" opacity=".5" />
          <path d="M33 49.5q6 8.5 12 0z" fill={INK} />
          <path d="M36 52.6q3 1.9 6 0" stroke="#F28B8B" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </motion.svg>
  )
}
