import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** The site's public address: absolute links for previews (Open Graph), the canonical URL, robots.txt and the sitemap. */
const PUBLIC_URL = (process.env.VITE_PUBLIC_URL || 'https://sipp.app').replace(/\/+$/, '')
/** Pages a search engine may index: the ones a visitor sees signed out. */
const INDEXED = ['/', '/demo', '/legal/terms', '/legal/privacy', '/legal/refunds', '/legal/notice']

function seo(): Plugin {
  return {
    name: 'sipp-seo',
    transformIndexHtml: (html) => html.replaceAll('%SIPP_PUBLIC_URL%', PUBLIC_URL),
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\nDisallow: /reset-password\nDisallow: /unsubscribe\nDisallow: /forgot-password\n\nSitemap: ${PUBLIC_URL}/sitemap.xml\n`,
      })
      const urls = INDEXED.map((path) => `  <url><loc>${PUBLIC_URL}${path}</loc></url>`).join('\n')
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    seo(),
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
        // Previews and crawlers only: never downloaded by the installed app.
        globIgnores: ['og-image.jpg', 'robots.txt', 'sitemap.xml'],
        navigateFallbackDenylist: [/^\/(robots\.txt|sitemap\.xml|og-image\.jpg)$/],
        navigateFallback: '/index.html',
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/illustrations/'),
            handler: 'CacheFirst',
            options: { cacheName: 'sipp-illustrations', expiration: { maxEntries: 80 } },
          },
        ],
      },
    }),
  ],
  server: { host: true },
})
