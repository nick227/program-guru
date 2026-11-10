import { describe, it, expect } from 'vitest'
import {
  formatHourLabel,
  formatTargetTime,
  isValidTargetTime,
  parseTargetTime,
  targetTimeInput,
} from './targetTime'

describe('targetTime helpers', () => {
  it('validates and parses 24-hour HH:mm times', () => {
    expect(isValidTargetTime('00:00')).toBe(true)
    expect(isValidTargetTime('23:59')).toBe(true)
    expect(isValidTargetTime('24:00')).toBe(false)
    expect(isValidTargetTime('')).toBe(false)
    expect(isValidTargetTime(null)).toBe(false)

    expect(parseTargetTime('')).toBeNull()
    expect(parseTargetTime('  ')).toBeNull()
    expect(parseTargetTime('07:30')).toBe('07:30')
    expect(parseTargetTime('07:30:00')).toBe('07:30')
    expect(parseTargetTime('99:99')).toBeNull()

    expect(targetTimeInput('07:30')).toBe('07:30')
    expect(targetTimeInput(null)).toBe('')
    expect(targetTimeInput('bad')).toBe('')
  })

  it('formats times and hourly labels in 12-hour AM/PM format', () => {
    expect(formatTargetTime('00:00')).toBe('12:00 AM')
    expect(formatTargetTime('07:05')).toBe('7:05 AM')
    expect(formatTargetTime('12:00')).toBe('12:00 PM')
    expect(formatTargetTime('18:30')).toBe('6:30 PM')
    expect(formatTargetTime(null)).toBeNull()

    expect(formatHourLabel(0)).toBe('12:00 AM')
    expect(formatHourLabel(1)).toBe('1:00 AM')
    expect(formatHourLabel(12)).toBe('12:00 PM')
    expect(formatHourLabel(23)).toBe('11:00 PM')
  })
})

