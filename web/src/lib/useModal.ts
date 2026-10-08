import { useEffect, useRef, type KeyboardEvent } from 'react'

export function useModal(open: boolean) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (open && element && !element.open) {
      element.showModal()
      element.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
  }, [open])
  useEffect(() => {
    const element = dialog.current
    return () => element?.close()
  }, [])

  function onKeyDown(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== 'Tab') return
    const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]')]
      .filter((el) => !el.matches(':disabled') && el.tabIndex >= 0 && el.getClientRects().length > 0)
    const first = controls[0]
    const last = controls.at(-1)
    if (!first || (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      e.preventDefault()
      const target = e.shiftKey ? last : first
      target?.focus()
    }
  }

  return { dialog, onKeyDown }
}
