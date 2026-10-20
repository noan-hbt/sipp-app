import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Sipp is an iOS app now. The web build only replaces the old PWA's service worker with one that
    // unregisters itself and clears its caches, so browsers that installed it get fresh pages again.
    // The app build (`--mode ios`) needs none of it.
    mode !== 'ios' && VitePWA({ selfDestroying: true, manifest: false }),
  ],
  server: { host: true },
}))
