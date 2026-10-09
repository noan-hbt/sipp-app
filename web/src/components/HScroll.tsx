import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

const FADE = 28

/** Horizontal scroller that fades the edges where more content hides, so nothing looks cut off. */
export function HScroll({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      setEdges({ start: el.scrollLeft > 2, end: max - el.scrollLeft > 2 })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  const mask = `linear-gradient(to right, ${edges.start ? 'transparent' : '#000'}, #000 ${FADE}px, #000 calc(100% - ${FADE}px), ${edges.end ? 'transparent' : '#000'})`
  return (
    <div
      ref={ref}
      className={className}
      style={{ overflowX: 'auto', scrollbarWidth: 'none', maskImage: mask, WebkitMaskImage: mask, ...style }}
    >
      {children}
    </div>
  )
}
