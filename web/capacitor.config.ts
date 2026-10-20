import type { CapacitorConfig } from '@capacitor/cli'

// The iOS app: the same React build (dist/), served from inside the app at capacitor://localhost.
// appId is the bundle id registered on App Store Connect (and APNS_TOPIC on the backend).
const config: CapacitorConfig = {
  appId: 'app.sipp',
  appName: 'Sipp',
  webDir: 'dist',
  backgroundColor: '#FBF5EE',
  ios: {
    // Safe areas are handled in CSS (env(safe-area-inset-*)), like the bands that run under the status bar.
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, launchAutoHide: true, backgroundColor: '#FBF5EE', showSpinner: false },
    PushNotifications: { presentationOptions: ['banner', 'sound'] },
    Keyboard: { resize: 'native', resizeOnFullScreen: true },
  },
}

export default config
