export type Term = 'short' | 'long'

export interface DebtSnapshot {
  id: string
  as_of: string
  balance: string
}

export interface DebtAccount {
  id: string
  name: string
  category: string | null
  term: Term
  sort_order: number | null
  paid_at: string | null
  snapshots: DebtSnapshot[]
}

export interface DebtsResponse {
  rows: DebtAccount[]
  categories: string[]
}

// Newest snapshot (rows arrive newest-first) or null if the debt has none.
export function latestSnapshot(d: DebtAccount): DebtSnapshot | null {
  return d.snapshots.length > 0 ? d.snapshots[0] : null
}

export function latestBalance(d: DebtAccount): number {
  const s = latestSnapshot(d)
  return s ? parseFloat(s.balance) : 0
}

// "Total Paid Off" (Paid Off tab): the peak (largest) balance the debt ever
// carried — the full amount that was ultimately paid off, never a sum of
// snapshots. Equals the amount for one-off items.
export function totalPaidOff(d: DebtAccount): number {
  return d.snapshots.reduce((m, s) => Math.max(m, parseFloat(s.balance)), 0)
}
