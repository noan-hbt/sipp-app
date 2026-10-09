import { Api, type Settings } from './api'

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** iOS only delivers web push to an app added to the home screen. */
export const needsInstall = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches

function keyBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

async function registration() {
  // No service worker in dev, or not yet installed: don't wait forever.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('no_service_worker')), 8000)),
  ])
}

/** Asks permission, subscribes this device and stores the subscription. */
export async function enablePush(publicKey: string): Promise<Settings> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('denied')
  const reg = await registration()
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  return Api.savePush(sub.toJSON())
}

export async function disablePush(): Promise<Settings> {
  try {
    const reg = await registration()
    await (await reg.pushManager.getSubscription())?.unsubscribe()
  } catch { /* nothing to unsubscribe */ }
  return Api.deletePush()
}
