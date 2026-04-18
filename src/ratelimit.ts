export interface RateLimiter {
  check: (key: string) => boolean
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>()
  return {
    check: (key: string): boolean => {
      const now = Date.now()
      const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
      if (timestamps.length >= limit) {
        hits.set(key, timestamps)
        return false
      }
      timestamps.push(now)
      hits.set(key, timestamps)
      return true
    },
  }
}
