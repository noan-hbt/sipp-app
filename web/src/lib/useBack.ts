import { useNavigate } from 'react-router-dom'

/** Back inside the app when there is somewhere to go back to, else home (a page opened from an email or a new tab). */
export function useBack() {
  const nav = useNavigate()
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) nav(-1)
    else nav('/', { replace: true })
  }
}
