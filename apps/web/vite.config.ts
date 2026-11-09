import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    injectRegister: false, // Registration and safe reload are owned by lib/pwa.ts.
    includeAssets: ['favicon.svg', 'favicon.ico', 'icons/*.png'],
    manifest: {
      id: '/', name: 'Program.Guru', short_name: 'Programs',
      description: 'Your programs and personal weekly calendar.',
      start_url: '/', scope: '/', display: 'standalone',
      theme_color: '#eef2f6', background_color: '#eef2f6',
      icons: [
        { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,woff,woff2}'],
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/(?:uploads|assets|icons)(?:\/|$)/, /^\/(?:sw\.js|workbox-[^/]+\.js|manifest\.webmanifest|favicon\.(?:ico|svg))$/],
      // No runtime caching: API, uploads and signed media always use the network.
      runtimeCaching: [],
      skipWaiting: false,
      clientsClaim: false,
      cleanupOutdatedCaches: true,
    },
  })],
  define: { 'import.meta.env.VITE_APP_BUILD': JSON.stringify(process.env.PWA_TEST_BUILD ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? 'local') },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173, strictPort: true },
  // Hosted single-origin deploy (`vite preview` on the web service): the browser calls /api on the web
  // origin and this forwards it over the private network to API_PROXY_TARGET, so session cookies are
  // same-site even on a public-suffix domain such as *.up.railway.app. Unset locally: no proxy.
  preview: {
    host: true,
    headers: { 'Cache-Control': 'no-cache' },
    port: Number(process.env.PORT ?? 4173),
    strictPort: true,
    allowedHosts: process.env.PREVIEW_ALLOWED_HOSTS?.split(',').map((h) => h.trim()).filter(Boolean),
    proxy: process.env.API_PROXY_TARGET
      ? { '/api': { target: process.env.API_PROXY_TARGET, rewrite: (p) => p.replace(/^\/api(?=\/|$)/, '') || '/' } }
      : undefined,
  },
})
