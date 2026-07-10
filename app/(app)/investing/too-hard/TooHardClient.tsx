'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, RotateCcw } from 'lucide-react'

export interface TooHardRow {
  id: string
  ticker: string
  company_name: string
  reason: string | null
  dismissed_at: string
}

export function TooHardClient({ initialRows }: { initialRows: TooHardRow[] }) {
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [reanalyzing, setReanalyzing] = useState<string | null>(null)

  async function handleReanalyze(id: string, ticker: string) {
    setReanalyzing(id)
    await fetch(`/api/investing/too-hard/${id}`, { method: 'PATCH' })
    setRows((prev) => prev.filter((r) => r.id !== id))
    router.push(`/investing/calculator?ticker=${ticker}`)
  }

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
            <td>{row.ticker}</td>
            <td>{row.company_name}</td>
            <td className="text-muted" style={{ fontSize: '0.875rem' }}>
              {new Date(row.dismissed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </td>
            <td
              className="text-muted"
              style={{ fontSize: '0.875rem' }}
              title={row.reason ?? undefined}
            >
              {row.reason
                ? row.reason.length > 35
                  ? row.reason.slice(0, 35) + '…'
                  : row.reason
                : '—'}
            </td>
            <td>
              <div style={{ display: 'flex', gap: 'var(--spacing-xs)', justifyContent: 'flex-end' }}>
                <button
                  className="btn-sm btn-secondary"
                  onClick={() => handleReanalyze(row.id, row.ticker)}
                  disabled={reanalyzing === row.id || deleting === row.id}
                  title="Re-analyze this stock"
                >
                  <RotateCcw size={13} /> Reanalyze
                </button>
                <button
                  className="btn-icon btn-icon--danger"
                  onClick={() => handleDelete(row.id, row.ticker)}
                  disabled={deleting === row.id || reanalyzing === row.id}
                  title="Remove permanently"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
