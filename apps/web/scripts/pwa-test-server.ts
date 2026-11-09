/** Production preview + real HTTP fixture backend: no browser interception of SW requests. */
import { createServer } from 'node:http'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import type { Page, Route } from '@playwright/test'
import { mockApi } from '../e2e/fixtures'

const root = 'test-results/pwa-builds'
rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })
for (const version of ['A', 'B']) {
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', `${root}/${version}`], {
    stdio: 'inherit', env: { ...process.env, VITE_API_URL: '/api', PWA_TEST_BUILD: version, NODE_ENV: 'production' },
  })
}
cpSync(`${root}/A`, `${root}/current`, { recursive: true })
const sessions = new Map<string, (route: Route) => unknown>()
let holdDraft = false
let processing = false
let meRequests = 0
const server = createServer(async (req, res) => {
  const path = new URL(req.url!, 'http://localhost').pathname
  if (path === '/__test/release') {
    cpSync(`${root}/B`, `${root}/current`, { recursive: true })
    res.end('B'); return
  }
  if (path === '/__test/state') {
    const url = new URL(req.url!, 'http://localhost')
    holdDraft = url.searchParams.get('hold') === 'true'
    processing = url.searchParams.get('processing') === 'true'
    res.end(JSON.stringify({ meRequests })); return
  }
  if (path === '/auth/me') meRequests++
  const cookie = req.headers.cookie?.match(/pwa-test=([^;]+)/)?.[1]
  const id = cookie ?? crypto.randomUUID()
  if (!sessions.has(id)) {
    await mockApi({ route: async (_pattern: string, handler: (route: Route) => unknown) => {
      sessions.set(id, handler)
    } } as unknown as Page)
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString()
  if (holdDraft && path.endsWith('/draft') && req.method === 'PATCH') {
    while (holdDraft) await new Promise(resolve => setTimeout(resolve, 50))
  }
  if (path === '/signed-media' || path === '/uploads/private') {
    res.setHeader('Cache-Control', 'no-store'); res.end('private-media'); return
  }
  try {
    await sessions.get(id)!({
      request: () => ({
        url: () => `http://localhost:3001${req.url}`, method: () => req.method,
        headers: () => req.headers, postDataJSON: () => JSON.parse(raw || '{}'),
      }),
      fulfill: async (response: {status?: number; contentType?: string; headers?: Record<string, string>; body?: string}) => {
        res.statusCode = response.status ?? 200
        res.setHeader('Content-Type', response.contentType ?? 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        if (!cookie) res.setHeader('Set-Cookie', `pwa-test=${id}; HttpOnly; SameSite=Lax; Path=/`)
        for (const [key, value] of Object.entries(response.headers ?? {})) res.setHeader(key, value)
        let body = (response.body ?? '').replaceAll('http://localhost:3001', '/api')
        if (processing && path.startsWith('/media/')) body = body.replaceAll('"state":"READY"', '"state":"PROCESSING"')
        res.end(body)
      },
    } as unknown as Route)
  } catch (error) {
    res.statusCode = 500; res.end(String(error))
  }
})
server.listen(5198, '127.0.0.1')
const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', '5197', '--outDir', `${root}/current`], {
  stdio: 'inherit', env: { ...process.env, API_PROXY_TARGET: 'http://127.0.0.1:5198' },
})
const close = () => { preview.kill(); server.close(); process.exit() }
process.on('SIGTERM', close)
process.on('SIGINT', close)
