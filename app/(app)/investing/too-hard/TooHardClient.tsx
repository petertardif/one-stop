'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'

export interface TooHardRow {
  id: string
  ticker: string
  company_name: string
  reason: string | null
  dismissed_at: string
}

export function TooHardClient({ initialRows }: { initialRows: TooHardRow[] }) {
  const [rows, setRows] = useState(initialRows)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string, ticker: string) {
    if (!confirm(`Permanently remove ${ticker} from the Too Hard pile?`)) return
    setDeleting(id)
    await fetch(`/api/investing/too-hard/${id}`, { method: 'DELETE' })
    setRows((prev) => prev.filter((r) => r.id !== id))
    setDeleting(null)
  }

  if (rows.length === 0) {
    return <p className="dashboard__empty">No stocks in the Too Hard pile.</p>
  }

  return (
    <table className="watchlist-table">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Company</th>
          <th>Date Dismissed</th>
          <th>Reason</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="watchlist-row">
            <td className="watchlist-table__ticker">{row.ticker}</td>
            <td>{row.company_name}</td>
            <td className="text-muted" style={{ fontSize: '0.875rem' }}>
              {new Date(row.dismissed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </td>
            <td className="text-muted" style={{ fontSize: '0.875rem' }}>{row.reason ?? '—'}</td>
            <td>
              <button
                className="btn-icon btn-icon--danger"
                onClick={() => handleDelete(row.id, row.ticker)}
                disabled={deleting === row.id}
                title="Remove permanently"
              >
                <Trash2 size={13} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
