import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rateLimit'

describe('createRateLimiter', () => {
  it('allows up to max events inside the window, then blocks', () => {
    const allow = createRateLimiter(3, 1000)
    expect([1, 2, 3, 4].map((i) => allow('a', i))).toEqual([true, true, true, false])
  })

  it('frees capacity once old events leave the window', () => {
    const allow = createRateLimiter(2, 1000)
    allow('a', 0)
    allow('a', 100)
    expect(allow('a', 500)).toBe(false)
    expect(allow('a', 1001)).toBe(true) // the event at t=0 has expired
  })

  it('does not count blocked attempts against the window', () => {
    const allow = createRateLimiter(1, 1000)
    allow('a', 0)
    for (let t = 1; t < 900; t += 100) allow('a', t) // hammering while blocked
    expect(allow('a', 1000)).toBe(true) // only the t=0 event counted
  })

  it('tracks keys independently', () => {
    const allow = createRateLimiter(1, 1000)
    expect(allow('a', 0)).toBe(true)
    expect(allow('b', 0)).toBe(true)
    expect(allow('a', 1)).toBe(false)
  })
})
