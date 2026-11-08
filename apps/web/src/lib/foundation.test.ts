import { describe, expect, it } from 'vitest'
import { ApiError } from '@project/sdk'
import { apiData, apiError } from '../../../../packages/sdk/src/client'
import {
  addDays,
  addMonths,
  isLocalDate,
  monthBounds,
  monthGrid,
  safeReturn,
  weekOf,
} from './dates'
describe('frontend boundary contracts', () => {
  it('preserves the complete server error envelope', () => {
    const error = apiError(new Response(null, { status: 409 }), {
      code: 'VERSION_CONFLICT',
      message: 'A newer revision exists',
      fieldErrors: { title: 'Changed elsewhere' },
      requestId: 'req-123',
    })
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      code: 'VERSION_CONFLICT',
      message: 'A newer revision exists',
      fieldErrors: { title: 'Changed elsewhere' },
      requestId: 'req-123',
    })
    expect(() =>
      apiData({
        response: new Response(null, { status: 400 }),
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid',
          requestId: 'req-456',
        },
      }),
    ).toThrow(ApiError)
  })
  it('keeps local date arithmetic stable through DST and year boundaries', () => {
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
    expect(weekOf('2027-01-01')).toBe('2026-12-28')
    expect(isLocalDate('2026-02-30')).toBe(false)
    expect(isLocalDate('2026-11-09')).toBe(true)
  })
  it('builds month navigation and Monday-first six-week grids', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(monthBounds('2024-02-20')).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
    })
    const grid = monthGrid('2026-11-15')
    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-10-26')
    expect(grid[6]).toBe('2026-11-01')
    expect(grid[35]).toBe('2026-11-30')
    expect(grid[41]).toBe('2026-12-06')
  })
  it('only accepts same-app return paths', () => {
    expect(safeReturn('//evil.test')).toBe('/')
    expect(safeReturn('/\\evil.test')).toBe('/')
    expect(safeReturn('https://evil.test')).toBe('/')
    expect(safeReturn('/?week=2026-11-09')).toBe('/?week=2026-11-09')
  })
})
