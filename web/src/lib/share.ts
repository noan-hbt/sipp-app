/** "J'ai fini mon Sip": a square image drawn on a canvas, shared natively or downloaded. */

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'
  }
  return lines
}

async function draw({ title, lessons, minutes, stars }: { title: string; lessons: number; minutes: number; stars: number }) {
  const size = 1080
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  await document.fonts?.ready
  const display = '"Bricolage Grotesque Variable", Outfit, system-ui, sans-serif'
  const body = 'Outfit, system-ui, sans-serif'

  ctx.fillStyle = '#d9622b'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = 'rgba(255,255,255,.10)'
  ctx.beginPath()
  ctx.arc(size - 120, 140, 260, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(90, size - 60, 200, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.font = `600 44px ${body}`
  ctx.fillText('J’ai fini mon Sip', 90, 200)
  ctx.font = `700 92px ${display}`
  const lines = wrap(ctx, title, size - 180, 4)
  lines.forEach((l, i) => ctx.fillText(l, 90, 320 + i * 104))

  const y = 320 + lines.length * 104 + 70
  const cells: [string, string][] = [
    [`${lessons}`, lessons > 1 ? 'leçons' : 'leçon'],
    [`${minutes}`, 'minutes'],
    [`${stars}`, stars > 1 ? 'étoiles' : 'étoile'],
  ]
  const w = (size - 180 - 40) / 3
  cells.forEach(([v, l], i) => {
    const x = 90 + i * (w + 20)
    ctx.fillStyle = 'rgba(255,255,255,.18)'
    ctx.beginPath()
    ctx.roundRect(x, y, w, 170, 36)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `700 72px ${display}`
    ctx.fillText(v, x + 32, y + 92)
    ctx.font = `500 34px ${body}`
    ctx.fillText(l, x + 32, y + 140)
  })

  ctx.font = `700 64px ${display}`
  ctx.fillText('Sipp', 90, size - 90)
  ctx.font = `500 34px ${body}`
  ctx.fillStyle = 'rgba(255,255,255,.85)'
  ctx.textAlign = 'right'
  ctx.fillText('Apprendre, 5 minutes à la fois', size - 90, size - 100)
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'))
}

/** Returns how it went out: the native share sheet, or a downloaded file. */
export async function shareSip(info: { title: string; lessons: number; minutes: number; stars: number }): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await draw(info)
  const file = new File([blob], 'sipp.png', { type: 'image/png' })
  const text = `J’ai fini « ${info.title} » sur Sipp.`
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sipp.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
