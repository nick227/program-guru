// EMAIL_PROVIDER=disabled: the worker runs without email. Messages are dropped, the outbox completes,
// and nothing identifying or secret (recipient, links with tokens) reaches the logs.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@project/db'
import { buildTestApp } from './helpers'
import { drain } from '../worker/outbox'
import { DisabledProvider, email, setEmailProvider } from '../infrastructure/email'

const app = buildTestApp()
let disabled: DisabledProvider
const saved = process.env.EMAIL_PROVIDER
beforeEach(() => {
  disabled = new DisabledProvider()
  setEmailProvider(disabled)
})
afterEach(() => {
  vi.restoreAllMocks()
  if (saved === undefined) delete process.env.EMAIL_PROVIDER
  else process.env.EMAIL_PROVIDER = saved
})

describe('EMAIL_PROVIDER=disabled', () => {
  it('is selected only by the explicit value', () => {
    process.env.EMAIL_PROVIDER = 'disabled'
    setEmailProvider(null as never) // reset the cached provider
    expect(email().kind).toBe('disabled')
    process.env.EMAIL_PROVIDER = 'capture'
    setEmailProvider(null as never)
    expect(email().kind).toBe('capture')
  })

  it('drops verification and reset emails, completes the outbox, and logs no recipient or token', async () => {
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void logs.push(args.join(' ')))
    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'quiet@example.com', password: 'a long password', handle: 'quiet', displayName: 'Quiet' } })
    expect(reg.statusCode).toBe(201)
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: 'quiet@example.com' } })
    await drain()
    expect(disabled.dropped).toBe(2)
    const events = await db.outboxEvent.findMany({ where: { type: { in: ['EmailVerificationRequested', 'PasswordResetRequested'] } } })
    expect(events.map((e) => e.status)).toEqual(['DONE', 'DONE'])
    const out = logs.join('\n')
    expect(out).toContain('delivery disabled; dropped "Confirm your email"')
    expect(out).not.toContain('quiet@example.com')
    expect(out).not.toMatch(/token=|verify-email|reset-password/)
    // Tokens still exist: verification and reset keep working once email is configured.
    expect(await db.authToken.count({ where: { user: { email: 'quiet@example.com' } } })).toBe(2)
  })
})
