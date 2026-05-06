'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { StatusBadge } from '@/components/investing/StatusBadge'

export interface WatchlistRow {
  id: string
  ticker: string
  company_name: string
  sector: string | null
  sticker_price: string | null
  mos_price: string | null
  growth_rate_used: string | null
  added_at: string
}

function fmt(v: number | null) {
  if (v === null) return '—'
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

function pct(v: number | null) {
  if (v === null) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(1)}%`
}

function LivePrice({ ticker }: { ticker: string }) {
  const { data, isLoading } = useQuery<{ price: number }>({
    queryKey: ['price', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/investing/fmp/${ticker}?data=price`)
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
  if (isLoading) return <span className="text-muted">…</span>
  if (!data) return <span className="text-muted">—</span>
  return <span>{fmt(data.price)}</span>
}

export function WatchlistClient({ initialRows, isAdmin }: { initialRows: WatchlistRow[]; isAdmin: boolean }) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState(initialRows)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(ticker: string) {
    if (!confirm(`Remove ${ticker} from your watchlist?`)) return
    setDeleting(ticker)
    await fetch(`/api/investing/watchlist/${ticker}`, { method: 'DELETE' })
    setRows((prev) => prev.filter((r) => r.ticker !== ticker))
    queryClient.removeQueries({ queryKey: ['price', ticker] })
    setDeleting(null)
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <img src="/empty-investing.svg" alt="" width={200} height={200} />
        <p className="empty-state__text">
          No stocks on your watchlist yet.{' '}
          <Link href="/investing/calculator" className="link">Analyze a stock</Link> to add one.
        </p>
      </div>
    )
  }

  return (
    <table className="watchlist-table">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Company</th>
          <th className="col-right">Current Price</th>
          <th className="col-right">Sticker</th>
          <th className="col-right">MOS Price</th>
          <th className="col-right">% to MOS</th>
          <th>Status</th>
          {isAdmin && <th />}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const sticker = row.sticker_price ? parseFloat(row.sticker_price) : null
          const mos = row.mos_price ? parseFloat(row.mos_price) : null

          return (
            <tr key={row.ticker} className="watchlist-row">
              <td>
                <Link href={`/investing/watchlist/${row.ticker}`} className="watchlist-table__ticker">
                  {row.ticker}
                </Link>
              </td>
              <td>{row.company_name}</td>
              <td className="col-right">
                <LivePrice ticker={row.ticker} />
              </td>
              <td className="col-right">{fmt(sticker)}</td>
              <td className="col-right">{fmt(mos)}</td>
              <td className="col-right">
                {/* % to MOS shown relative to current price — computed client-side */}
                <MosPct ticker={row.ticker} mos={mos} />
              </td>
              <td>
                <MosStatus ticker={row.ticker} sticker={sticker} mos={mos} />
              </td>
              {isAdmin && (
                <td>
                  <button
                    className="btn-icon btn-icon--danger"
                    onClick={() => handleDelete(row.ticker)}
                    disabled={deleting === row.ticker}
                    title="Remove from watchlist"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function MosPct({ ticker, mos }: { ticker: string; mos: number | null }) {
  const { data } = useQuery<{ price: number }>({
    queryKey: ['price', ticker],
    enabled: false, // reuses cached data from LivePrice
  })
  if (!data || mos === null) return <span className="text-muted">—</span>
  const diff = (data.price - mos) / mos
  return <span className={diff <= 0 ? 'positive' : 'negative'}>{pct(diff)}</span>
}

function MosStatus({ ticker, sticker, mos }: { ticker: string; sticker: number | null; mos: number | null }) {
  const { data } = useQuery<{ price: number }>({
    queryKey: ['price', ticker],
    enabled: false,
  })
  return <StatusBadge price={data?.price ?? null} stickerPrice={sticker} mosPrice={mos} />
}
