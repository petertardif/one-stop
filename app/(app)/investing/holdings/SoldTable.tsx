'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArchiveRestore, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import type { HoldingLot } from '@/lib/holdings'

const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const pct = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`)
const sign = (v: number | null) => (v === null ? '' : v >= 0 ? 'positive' : 'negative')

async function send(url: string, method: string) {
  const res = await fetch(url, { method })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
}

/** Sold tab: one row per sold lot with its realized gain. */
export function SoldTable({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['holdings', 'sold'],
    queryFn: async () => {
      const res = await fetch('/api/investing/holdings?status=sold')
      if (!res.ok) throw new Error('Failed to load sold lots')
      return res.json() as Promise<HoldingLot[]>
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['holdings'] })
  const restore = useMutation({ mutationFn: (id: string) => send(`/api/investing/holdings/${id}/restore`, 'POST'), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (id: string) => send(`/api/investing/holdings/${id}`, 'DELETE'), onSuccess: invalidate })

  const rows = lots.map((lot) => {
    const shares = parseFloat(lot.shares)
    const cost = shares * parseFloat(lot.price)
    const proceeds = shares * parseFloat(lot.sale_price ?? '0')
    return { lot, shares, cost, proceeds, gain: proceeds - cost }
  })
  const totalCost = rows.reduce((s, r) => s + r.cost, 0)
  const totalProceeds = rows.reduce((s, r) => s + r.proceeds, 0)
  const totalGain = totalProceeds - totalCost

  if (isLoading) return <Spinner />

  return (
    <div className="ledger-table-wrap">
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Sold</th>
            <th>Ticker</th>
            <th>Company</th>
            <th>Bought</th>
            <th className="amount-col">Shares</th>
            <th className="amount-col">Buy Price</th>
            <th className="amount-col">Sale Price</th>
            <th className="amount-col">Cost Basis</th>
            <th className="amount-col">Proceeds</th>
            <th className="amount-col">Gain $</th>
            <th className="amount-col">Gain %</th>
            {canWrite && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ lot, shares, cost, proceeds, gain }) => (
            <tr key={lot.id}>
              <td>{lot.sold_on}</td>
              <td><strong>{lot.ticker}</strong></td>
              <td>{lot.company_name}</td>
              <td>{lot.bought_on}</td>
              <td className="amount-col">{shares.toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
              <td className="amount-col">{money(parseFloat(lot.price))}</td>
              <td className="amount-col">{money(parseFloat(lot.sale_price ?? '0'))}</td>
              <td className="amount-col">{money(cost)}</td>
              <td className="amount-col">{money(proceeds)}</td>
              <td className={`amount-col ${sign(gain)}`}>{money(gain)}</td>
              <td className={`amount-col ${sign(gain)}`}>{pct(cost ? gain / cost : null)}</td>
              {canWrite && (
                <td>
                  <button className="icon-btn icon-btn--edit" aria-label="Undo sale" disabled={restore.isPending}
                    onClick={() => { if (confirm(`Undo this ${lot.ticker} sale? The lot goes back to Open.`)) restore.mutate(lot.id) }}>
                    <ArchiveRestore size={15} />
                  </button>
                  <button className="icon-btn icon-btn--delete" aria-label="Delete lot" disabled={remove.isPending}
                    onClick={() => { if (confirm(`Permanently delete this sold ${lot.ticker} lot?`)) remove.mutate(lot.id) }}>
                    <Trash2 size={15} />
                  </button>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={canWrite ? 12 : 11} className="col-center">No sales yet.</td></tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="budget-total-row">
              <td>Total</td><td></td><td></td><td></td><td></td><td></td><td></td>
              <td className="amount-col">{money(totalCost)}</td>
              <td className="amount-col">{money(totalProceeds)}</td>
              <td className={`amount-col ${sign(totalGain)}`}>{money(totalGain)}</td>
              <td className={`amount-col ${sign(totalGain)}`}>{pct(totalCost ? totalGain / totalCost : null)}</td>
              {canWrite && <td></td>}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
