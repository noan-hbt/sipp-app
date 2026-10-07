import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sipp',
        short_name: 'Sipp',
        description: 'Apprends ce que tu veux, cinq minutes à la fois.',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FBF5EE',
        theme_color: '#FBF5EE',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/illustrations/'),
            handler: 'CacheFirst',
            options: { cacheName: 'sipp-illustrations', expiration: { maxEntries: 80 } },
          },
          {
            urlPattern: ({ url, request, sameOrigin }) => !sameOrigin && request.method === 'GET' && (
              url.pathname.startsWith('/sips') ||
              url.pathname.startsWith('/lessons/') ||
              url.pathname.startsWith('/auth/me')
            ),
            handler: 'NetworkFirst',
            options: {
              networkTimeoutSeconds: 4,
              cacheName: 'sipp-api',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: { host: true },
})
