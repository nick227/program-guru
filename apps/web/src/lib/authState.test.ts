import { describe, expect, it } from 'vitest'
import { ApiError, authStateOf, isTransientAuthError } from '@project/sdk'

// 11-MEDIA §6: only a 401 means signed out; a rate limit or server error never does.
describe('auth state', () => {
  it('signed in with data, signed out only on a 401 answer', () => {
    expect(authStateOf({ data: { data: { id: 'u' } }, error: null })).toBe('signed-in')
    expect(authStateOf({ data: null, error: null })).toBe('signed-out')
    expect(authStateOf({ data: undefined, error: new ApiError(401, 'no') })).toBe('signed-out')
  })
  it('pending checks and transient failures are unknown, never signed out', () => {
    expect(authStateOf({ data: undefined, error: null })).toBe('unknown')
    expect(authStateOf({ data: undefined, error: new ApiError(429, 'slow down') })).toBe('unknown')
    expect(authStateOf({ data: undefined, error: new ApiError(503, 'down') })).toBe('unknown')
    expect(authStateOf({ data: undefined, error: new TypeError('fetch failed') })).toBe('unknown')
  })
  it('retries only rate limits and server errors', () => {
    expect(isTransientAuthError(new ApiError(429, ''))).toBe(true)
    expect(isTransientAuthError(new ApiError(502, ''))).toBe(true)
    expect(isTransientAuthError(new ApiError(401, ''))).toBe(false)
    expect(isTransientAuthError(new TypeError('x'))).toBe(false)
  })
})
