interface RateLimitEntry {
  count: number
  resetAt: number
}

// Singleton store — survives across requests within the same server process
const globalForRateLimit = globalThis as unknown as { rateLimitStore?: Map<string, RateLimitEntry> }
const store = globalForRateLimit.rateLimitStore ?? new Map<string, RateLimitEntry>()
if (process.env.NODE_ENV !== 'production') globalForRateLimit.rateLimitStore = store

/**
 * Returns true if the request is allowed, false if rate limit exceeded.
 * @param key      — identifier (e.g. IP address or email)
 * @param limit    — max requests allowed in the window
 * @param windowMs — rolling window in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false

  entry.count += 1
  return true
}
