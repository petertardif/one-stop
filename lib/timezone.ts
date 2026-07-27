// Validate an IANA timezone string sent by the client (e.g. from
// `Intl.DateTimeFormat().resolvedOptions().timeZone`) before it reaches SQL.
// An unknown zone makes `Intl.DateTimeFormat` throw a RangeError; fall back to
// UTC. The returned value is always a real zone name, safe to pass as a query
// parameter to `now() AT TIME ZONE $n`.
export function resolveTimeZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC'
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}
