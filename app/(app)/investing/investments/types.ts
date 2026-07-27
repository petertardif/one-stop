export type Cadence = 'none' | 'weekly' | 'biweekly' | 'monthly' | 'annual'

export interface Snapshot {
  id: string
  as_of: string
  value: string
}

export interface Investment {
  id: string
  brokerage: string
  type: string | null
  owner: string | null
  type_description: string | null
  contribution_cadence: Cadence
  contribution_amount: string | null
  contribution_note: string | null
  strategy: string | null
  sort_order: number | null
  liquidated_at: string | null
  snapshots: Snapshot[]
}

export interface InvestmentsResponse {
  rows: Investment[]
  dates: string[]
}

// Newest snapshot (rows arrive newest-first) or null if the account has none.
export function latestSnapshot(inv: Investment): Snapshot | null {
  return inv.snapshots.length > 0 ? inv.snapshots[0] : null
}

export function latestValue(inv: Investment): number {
  const s = latestSnapshot(inv)
  return s ? parseFloat(s.value) : 0
}
