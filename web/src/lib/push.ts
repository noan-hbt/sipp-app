import { PushNotifications } from '@capacitor/push-notifications'
import { Api, type Settings } from './api'
import { isNative } from './native'

/** Reminders arrive as iOS notifications: only inside the app. */
export const pushSupported = () => isNative

/** Registers with APNs and resolves with this device's token. */
async function deviceToken(): Promise<string> {
  const handles: { remove: () => Promise<void> }[] = []
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no_token')), 15000)
      void PushNotifications.addListener('registration', (t) => {
        clearTimeout(timer)
        resolve(t.value)
      }).then((h) => handles.push(h))
      void PushNotifications.addListener('registrationError', (e) => {
        clearTimeout(timer)
        reject(new Error(e.error))
      }).then((h) => handles.push(h))
      PushNotifications.register().catch(reject)
    })
  } finally {
    for (const h of handles) void h.remove()
  }
}

/** Asks permission, registers this device and stores its token. */
export async function enablePush(): Promise<Settings> {
  let permission = await PushNotifications.checkPermissions()
  if (permission.receive !== 'granted' && permission.receive !== 'denied') permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') throw new Error('denied')
  return Api.savePush(await deviceToken())
}

export async function disablePush(): Promise<Settings> {
  try {
    await PushNotifications.unregister()
  } catch { /* nothing registered */ }
  return Api.deletePush()
}

/** APNs can hand the app a new token (restore, reinstall): keep the server's copy current. */
export async function refreshPushToken(): Promise<void> {
  if (!isNative) return
  const settings = await Api.settings()
  if (!settings.push_enabled || (await PushNotifications.checkPermissions()).receive !== 'granted') return
  await Api.savePush(await deviceToken())
}

/** A tapped reminder opens the screen it points to. */
export function onPushOpened(go: (url: string) => void): () => void {
  if (!isNative) return () => {}
  const handle = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const url = (action.notification.data as { url?: unknown } | undefined)?.url
    go(typeof url === 'string' && url.startsWith('/') ? url : '/')
  })
  return () => void handle.then((h) => h.remove())
}
