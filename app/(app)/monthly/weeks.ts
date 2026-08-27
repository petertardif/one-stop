// Fri→Thu week helpers shared by the Ledger and 1k Weekly tabs. All week keys are the
// Friday that starts the week, matching the `weekStartExpr` SQL in lib/weeklyBudget.ts.

// Format a Friday week-start (YYYY-MM-DD) as "Jul 11 – Jul 17" (Fri → Thu).
// Parse/format in UTC so the date the server computed isn't shifted by timezone.
export function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00Z')
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${fmt(start)} – ${fmt(end)}`
}

// Friday (YYYY-MM-DD) that starts the Fri→Thu week containing `d`, matching the
// ledger's SQL week key. Computed in UTC so it never shifts by a day.
export function weekStartOf(d: Date): string {
  const offset = (d.getDay() + 2) % 7 // Fri(5)→0, Thu(4)→6
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  utc.setUTCDate(utc.getUTCDate() - offset)
  return utc.toISOString().slice(0, 10)
}

// The browser's IANA zone, sent to the API so "this week" is computed from the user's
// today rather than the DB's UTC.
export function userTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
