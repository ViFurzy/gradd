import { describe, expect, it } from 'vitest'
import { isTimeInSchedule } from './schedule'

describe('isTimeInSchedule', () => {
  it('same-day window: start inclusive, end exclusive', () => {
    expect(isTimeInSchedule('09:00', '09:00', '17:00')).toBe(true)
    expect(isTimeInSchedule('12:30', '09:00', '17:00')).toBe(true)
    expect(isTimeInSchedule('17:00', '09:00', '17:00')).toBe(false)
    expect(isTimeInSchedule('08:59', '09:00', '17:00')).toBe(false)
  })

  it('window spanning midnight wraps correctly', () => {
    expect(isTimeInSchedule('22:00', '22:00', '08:00')).toBe(true)
    expect(isTimeInSchedule('23:59', '22:00', '08:00')).toBe(true)
    expect(isTimeInSchedule('00:00', '22:00', '08:00')).toBe(true)
    expect(isTimeInSchedule('07:59', '22:00', '08:00')).toBe(true)
    expect(isTimeInSchedule('08:00', '22:00', '08:00')).toBe(false)
    expect(isTimeInSchedule('12:00', '22:00', '08:00')).toBe(false)
  })

  it('equal start and end is never active', () => {
    expect(isTimeInSchedule('10:00', '10:00', '10:00')).toBe(false)
  })
})
