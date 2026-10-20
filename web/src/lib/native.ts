import { Capacitor } from '@capacitor/core'

/** Running inside the iOS app (Capacitor), not in a browser. */
export const isNative = Capacitor.isNativePlatform()

/** Opens a link outside the app: Safari, or the App Store's subscription settings. */
export function openExternal(url: string) {
  // The app's web view never navigates away: Capacitor hands foreign URLs to iOS.
  window.open(url, '_blank')
}

/** Apple's page to change or cancel an App Store subscription. */
export const MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions'
