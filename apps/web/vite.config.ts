import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173, strictPort: true },
  // Hosted single-origin deploy (`vite preview` on the web service): the browser calls /api on the web
  // origin and this forwards it over the private network to API_PROXY_TARGET, so session cookies are
  // same-site even on a public-suffix domain such as *.up.railway.app. Unset locally: no proxy.
  preview: {
    host: true,
    port: Number(process.env.PORT ?? 4173),
    strictPort: true,
    allowedHosts: process.env.PREVIEW_ALLOWED_HOSTS?.split(',').map((h) => h.trim()).filter(Boolean),
    proxy: process.env.API_PROXY_TARGET
      ? { '/api': { target: process.env.API_PROXY_TARGET, rewrite: (p) => p.replace(/^\/api(?=\/|$)/, '') || '/' } }
      : undefined,
  },
})
