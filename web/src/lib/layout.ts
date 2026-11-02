import { useSyncExternalStore } from 'react'

/** Tablets and phones held sideways: tabs on a rail, content in a centered column. Matches global.css. */
export const WIDE_QUERY = '(min-width: 640px)'

const media = typeof window !== 'undefined' ? window.matchMedia(WIDE_QUERY) : null
const subscribe = (cb: () => void) => {
  media?.addEventListener('change', cb)
  return () => media?.removeEventListener('change', cb)
}

export function useWide() {
  return useSyncExternalStore(subscribe, () => media?.matches ?? false, () => false)
}

/** Reading column width per kind of screen (CSS length). */
export const COL = { narrow: '560px', regular: '680px', wide: '1040px' } as const
export type ColWidth = keyof typeof COL
