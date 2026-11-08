// Client identity behind Railway's proxy, and rate limiting keyed on it. Uses a real app with rate
// limiting ENABLED and simulated TCP peers (inject remoteAddress): a trusted proxy peer (10.0.0.5) and
// an untrusted internet peer (203.0.113.7).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app'
import { clientIp, parseClientIpConfig } from '../lib/clientIp'
import { AUTH_ROUTE_LIMITS, GLOBAL_RATE_LIMIT } from '../lib/rateLimit'

const PROXY = '10.0.0.5'
const INTERNET = '203.0.113.7'
const LOGIN_MAX = AUTH_ROUTE_LIMITS['POST /auth/login']!.max
let apps: FastifyInstance[] = []
const saved = { header: process.env.CLIENT_IP_HEADER, cidrs: process.env.TRUSTED_PROXY_CIDRS }

beforeAll(async () => {
  apps = [await buildApp(), await buildApp()] // two instances: limits must be shared through the database
  await Promise.all(apps.map((a) => a.ready()))
})
afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()))
  process.env.CLIENT_IP_HEADER = saved.header
  process.env.TRUSTED_PROXY_CIDRS = saved.cidrs
})
beforeEach(() => {
  process.env.CLIENT_IP_HEADER = 'x-real-ip'
  delete process.env.TRUSTED_PROXY_CIDRS // defaults: private + CGNAT ranges
})

const login = (opts: { peer: string; headers?: Record<string, string>; email: string; app?: FastifyInstance }) =>
  (opts.app ?? apps[0]!).inject({ method: 'POST', url: '/auth/login', remoteAddress: opts.peer, headers: opts.headers ?? {}, payload: { email: opts.email, password: 'wrong-password' } })
/** Status codes for n sign-in attempts, each with a fresh email so only the IP limit can trip. */
async function attempts(n: number, make: (i: number) => Parameters<typeof login>[0]) {
  const codes: number[] = []
  for (let i = 0; i < n; i++) codes.push((await login(make(i))).statusCode)
  return codes
}
const tag = () => Math.random().toString(36).slice(2, 8)

describe('clientIp', () => {
  const req = (ip: string, headers: Record<string, string | string[]> = {}) => ({ ip, headers })

  it('uses X-Real-IP only from a trusted proxy peer, and never X-Forwarded-For', () => {
    expect(clientIp(req(PROXY, { 'x-real-ip': '198.51.100.1' }))).toBe('198.51.100.1')
    expect(clientIp(req(`::ffff:${PROXY}`, { 'x-real-ip': '198.51.100.1' }))).toBe('198.51.100.1')
    expect(clientIp(req(INTERNET, { 'x-real-ip': '198.51.100.1' }))).toBe(INTERNET)
    expect(clientIp(req(PROXY, { 'x-forwarded-for': '198.51.100.9' }))).toBe(PROXY)
    expect(clientIp(req(INTERNET, { 'x-forwarded-for': '10.0.0.1, 198.51.100.9' }))).toBe(INTERNET)
  })

  it('falls back to the peer on a malformed or repeated header, or when disabled', () => {
    expect(clientIp(req(PROXY, { 'x-real-ip': 'not-an-ip' }))).toBe(PROXY)
    expect(clientIp(req(PROXY, { 'x-real-ip': ['198.51.100.1', '198.51.100.2'] }))).toBe(PROXY)
    process.env.CLIENT_IP_HEADER = 'none'
    expect(clientIp(req(PROXY, { 'x-real-ip': '198.51.100.1' }))).toBe(PROXY)
    process.env.CLIENT_IP_HEADER = 'x-forwarded-for' // unsupported: ignored, never trusted
    expect(clientIp(req(PROXY, { 'x-forwarded-for': '198.51.100.1' }))).toBe(PROXY)
  })

  it('honours a configured proxy range and rejects invalid ranges', () => {
    process.env.TRUSTED_PROXY_CIDRS = '192.0.2.0/24'
    expect(clientIp(req('192.0.2.10', { 'x-real-ip': '198.51.100.1' }))).toBe('198.51.100.1')
    expect(clientIp(req(PROXY, { 'x-real-ip': '198.51.100.1' }))).toBe(PROXY) // 10/8 no longer trusted
    expect(() => parseClientIpConfig({ TRUSTED_PROXY_CIDRS: 'example.com/8' })).toThrow(/not an IP range/)
  })
})

describe('rate limits behind the proxy', () => {
  it('clients behind the same proxy have independent sign-in limits', async () => {
    const t = tag()
    const a = await attempts(LOGIN_MAX + 1, (i) => ({ peer: PROXY, headers: { 'x-real-ip': '198.51.100.11' }, email: `a${i}-${t}@test.local` }))
    expect(a.slice(0, LOGIN_MAX).every((c) => c === 401)).toBe(true)
    expect(a.at(-1)).toBe(429) // repeated requests from one client are limited
    const b = await attempts(3, (i) => ({ peer: PROXY, headers: { 'x-real-ip': '198.51.100.12' }, email: `b${i}-${t}@test.local` }))
    expect(b).toEqual([401, 401, 401]) // a second client through the same proxy is unaffected
  })

  it('spoofed forwarding headers from the internet cannot escape the limit', async () => {
    const t = tag()
    const codes = await attempts(LOGIN_MAX + 1, (i) => ({
      peer: INTERNET,
      headers: { 'x-real-ip': `198.51.100.${100 + i}`, 'x-forwarded-for': `192.0.2.${i}, 10.0.0.${i}` },
      email: `s${i}-${t}@test.local`,
    }))
    expect(codes.at(-1)).toBe(429)
  })

  it('a client rotating X-Forwarded-For through the proxy is still one client', async () => {
    const t = tag()
    const codes = await attempts(LOGIN_MAX + 1, (i) => ({
      peer: PROXY,
      headers: { 'x-real-ip': '198.51.100.21', 'x-forwarded-for': `192.0.2.${i}` },
      email: `x${i}-${t}@test.local`,
    }))
    expect(codes.at(-1)).toBe(429)
  })

  it('the per-email sign-in limit still applies across different clients', async () => {
    const email = `target-${tag()}@test.local`
    const codes = await attempts(LOGIN_MAX + 1, (i) => ({ peer: PROXY, headers: { 'x-real-ip': `198.51.100.${30 + i}` }, email }))
    expect(codes.at(-1)).toBe(429)
  })

  it('limits are shared across API instances', async () => {
    const t = tag()
    const codes = await attempts(LOGIN_MAX + 1, (i) => ({ app: apps[i % 2], peer: PROXY, headers: { 'x-real-ip': '198.51.100.41' }, email: `m${i}-${t}@test.local` }))
    expect(codes.at(-1)).toBe(429)
  })

  it('the global API limit applies per client, not per proxy', async () => {
    const get = (ip: string) => apps[0]!.inject({ method: 'GET', url: '/catalog/categories', remoteAddress: PROXY, headers: { 'x-real-ip': ip } })
    for (let i = 0; i < GLOBAL_RATE_LIMIT.max; i++) expect((await get('198.51.100.51')).statusCode).toBe(200)
    const over = await get('198.51.100.51')
    expect(over.statusCode).toBe(429)
    expect(over.headers['retry-after']).toBeDefined()
    expect((await get('198.51.100.52')).statusCode).toBe(200)
  }, 60_000)

  it('with the header disabled, everything behind the proxy shares one identity (the old behaviour)', async () => {
    process.env.CLIENT_IP_HEADER = 'none'
    const t = tag()
    const codes = await attempts(LOGIN_MAX + 1, (i) => ({ peer: PROXY, headers: { 'x-real-ip': `198.51.100.${60 + i}` }, email: `n${i}-${t}@test.local` }))
    expect(codes.at(-1)).toBe(429)
  })
})
