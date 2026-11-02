// Sliding-window limiter: at most `max` events per `windowMs` for each key.
export function createRateLimiter(
  max: number,
  windowMs: number
): (key: string, now?: number) => boolean {
  const hits = new Map<string, number[]>()
  return (key, now = Date.now()) => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    const allowed = recent.length < max
    if (allowed) recent.push(now)
    hits.set(key, recent)
    return allowed
  }
}
