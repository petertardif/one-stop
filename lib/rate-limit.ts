const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 10

interface Entry {
  count: number
  resetAt: number
}

const store = new Map<string, Entry>()

export function checkIpRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 }
  }

  entry.count += 1
  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 }
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count }
}
