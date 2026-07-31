// Shared carry-forward (last-observation-carried-forward) helper for dated
// snapshot series. Used by the Debts + Investments charts and the dashboard's
// net-worth trend so a snapshot that wasn't updated on a given date still counts
// at its most recent prior value.

export interface DatedSnapshot {
  as_of: string
}

/**
 * The series' most recent value on or before `day` (a `YYYY-MM-DD` string).
 * Returns null when there is no snapshot as of that date (e.g. the account
 * didn't exist yet), so callers can treat it as $0 or a gap as appropriate.
 *
 * `pick` extracts the numeric value from a snapshot, e.g. `s => parseFloat(s.balance)`.
 */
export function valueOnOrBefore<T extends DatedSnapshot>(
  snapshots: T[],
  day: string,
  pick: (s: T) => number
): number | null {
  let bestDate = ''
  let best: number | null = null
  for (const s of snapshots) {
    const sd = s.as_of.slice(0, 10)
    if (sd <= day && sd >= bestDate) {
      bestDate = sd
      best = pick(s)
    }
  }
  return best
}
