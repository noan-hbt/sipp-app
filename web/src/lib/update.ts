// A new version installs itself in the background (autoUpdate) and takes over the open page, whose own code is then
// out of date. Reload into it at a calm moment: when the app comes back to the foreground or moves to another screen,
// never in the middle of a lesson or a quiz.
const BUSY = /^\/(lessons|modules)\//
const CHECK_EVERY = 30 * 60 * 1000

let pending = false
let lastCheck = Date.now()

function reloadIfCalm(path: string) {
  if (pending && !BUSY.test(path)) {
    pending = false
    window.location.reload()
  }
}

export function watchForUpdates() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  // The first install also fires controllerchange: only a page already controlled runs older code.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      pending = true
    })
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    reloadIfCalm(window.location.pathname)
    if (Date.now() - lastCheck > CHECK_EVERY) {
      lastCheck = Date.now()
      void navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
    }
  })
}

/** Called on every screen change. */
export function updateOnNavigation(path: string) {
  reloadIfCalm(path)
}
