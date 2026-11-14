'use client'

import { Fragment, useMemo, useRef, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeDollarSign, Check, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import type { HoldingLot } from '@/lib/holdings'
import { formatMoneyCents } from '@/lib/format'
import { AddLotModal } from './AddLotModal'
import { SellModal, SellTarget } from './SellModal'
import { SoldTable } from './SoldTable'

interface Position {
  ticker: string
  company_name: string
  lots: HoldingLot[]
  shares: number
  cost: number
}

const money = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const pct = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`)
const sign = (v: number | null) => (v === null ? '' : v >= 0 ? 'positive' : 'negative')
const num = (s: string) => parseFloat(s)

function groupLots(lots: HoldingLot[]): Position[] {
  const map = new Map<string, Position>()
  for (const lot of lots) {
    const p = map.get(lot.ticker) ?? { ticker: lot.ticker, company_name: lot.company_name, lots: [], shares: 0, cost: 0 }
    p.lots.push(lot)
    p.shares += num(lot.shares)
    p.cost += num(lot.shares) * num(lot.price)
    map.set(lot.ticker, p)
  }
  return Array.from(map.values()).sort((a, b) => a.ticker.localeCompare(b.ticker))
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json() as Promise<T>
}

export function HoldingsClient({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const sellRef = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState<'open' | 'sold'>('open')
  const [sellTarget, setSellTarget] = useState<SellTarget | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ shares: '', price: '', bought_on: '', notes: '' })

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['holdings', 'open'],
    queryFn: () => fetchJson<HoldingLot[]>('/api/investing/holdings'),
  })
  const positions = useMemo(() => groupLots(lots), [lots])

  // Same endpoint and cache key the Watchlist uses for current prices.
  const priceQueries = useQueries({
    queries: positions.map((p) => ({
      queryKey: ['price', p.ticker],
      queryFn: () => fetchJson<{ price: number }>(`/api/investing/fmp/${p.ticker}?data=price`),
      staleTime: 5 * 60 * 1000,
    })),
  })
  const priceOf = (i: number): number | null => priceQueries[i]?.data?.price ?? null

  const updateLot = useMutation({
    mutationFn: (lot: HoldingLot) =>
      fetchJson<HoldingLot>(`/api/investing/holdings/${lot.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lot, ...edit, notes: edit.notes.trim() || null }),
      }),
    onSuccess: () => { setEditId(null); queryClient.invalidateQueries({ queryKey: ['holdings'] }) },
  })

  const deleteLot = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/investing/holdings/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['holdings'] }),
  })

  function toggle(ticker: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker); else next.add(ticker)
      return next
    })
  }

  function openSell(p: Position, price: number | null) {
    setSellTarget({ ticker: p.ticker, shares: p.shares, price })
    requestAnimationFrame(() => sellRef.current?.showModal())
  }

  function startEdit(lot: HoldingLot) {
    setEditId(lot.id)
    setEdit({ shares: String(num(lot.shares)), price: num(lot.price).toFixed(2), bought_on: lot.bought_on, notes: lot.notes ?? '' })
  }

  let totalCost = 0
  let totalValue = 0
  let allPriced = true
  positions.forEach((p, i) => {
    const price = priceOf(i)
    totalCost += p.cost
    if (price === null) allPriced = false
    else totalValue += price * p.shares
  })
  const totalGain = allPriced ? totalValue - totalCost : null

  return (
    <div className="monthly-ledger">
      <div className="ledger-header"><h1>Holdings</h1></div>

      <div className="ledger-controls">
        <div className="account-tabs">
          <button className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>Open</button>
          <button className={tab === 'sold' ? 'active' : ''} onClick={() => setTab('sold')}>Sold</button>
        </div>
        {canWrite && tab === 'open' && (
          <div className="ledger-actions">
            <button className="primary" onClick={() => dialogRef.current?.showModal()}><Plus size={14} /> Add lot</button>
          </div>
        )}
      </div>

      {tab === 'sold' ? <SoldTable canWrite={canWrite} /> : <>
      {isLoading && <Spinner />}

      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th></th>
              <th>Ticker</th>
              <th>Company</th>
              <th className="amount-col">Shares</th>
              <th className="amount-col">Avg Cost</th>
              <th className="amount-col">Cost Basis</th>
              <th className="amount-col">Price</th>
              <th className="amount-col">Market Value</th>
              <th className="amount-col">Gain $</th>
              <th className="amount-col">Gain %</th>
              {canWrite && <th></th>}
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => {
              const price = priceOf(i)
              const value = price === null ? null : price * p.shares
              const gain = value === null ? null : value - p.cost
              const gainPct = gain === null || p.cost === 0 ? null : gain / p.cost
              const open = expanded.has(p.ticker)
              return (
                <Fragment key={p.ticker}>
                  <tr>
                    <td>
                      <button className="icon-btn inv-expand" onClick={() => toggle(p.ticker)}
                        aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open}>
                        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td><strong>{p.ticker}</strong></td>
                    <td>{p.company_name}</td>
                    <td className="amount-col">{p.shares.toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
                    <td className="amount-col">{money(p.shares ? p.cost / p.shares : null)}</td>
                    <td className="amount-col">{money(p.cost)}</td>
                    <td className="amount-col">{priceQueries[i]?.isLoading ? '…' : money(price)}</td>
                    <td className="amount-col">{money(value)}</td>
                    <td className={`amount-col ${sign(gain)}`}>{money(gain)}</td>
                    <td className={`amount-col ${sign(gainPct)}`}>{pct(gainPct)}</td>
                    {canWrite && (
                      <td>
                        <button className="icon-btn icon-btn--edit" onClick={() => openSell(p, price)} aria-label={`Sell ${p.ticker}`}>
                          <BadgeDollarSign size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                  {open && (
                    <tr className="inv-detail-row">
                      <td></td>
                      <td colSpan={canWrite ? 10 : 9}>
                        <div className="inv-detail">
                          <div className="inv-detail-history">
                            <h3>Lots</h3>
                            <table className="inv-history-table">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th className="amount-col">Shares</th>
                                  <th className="amount-col">Price</th>
                                  <th className="amount-col">Cost</th>
                                  <th>Notes</th>
                                  {canWrite && <th></th>}
                                </tr>
                              </thead>
                              <tbody>
                                {p.lots.map((lot) => {
                                  const editing = editId === lot.id
                                  return (
                                    <tr key={lot.id}>
                                      <td>{editing
                                        ? <input type="date" value={edit.bought_on} onChange={(e) => setEdit({ ...edit, bought_on: e.target.value })} />
                                        : lot.bought_on}</td>
                                      <td className="amount-col">{editing
                                        ? <input type="number" min="0" step="any" value={edit.shares} onChange={(e) => setEdit({ ...edit, shares: e.target.value })} />
                                        : num(lot.shares).toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
                                      <td className="amount-col">{editing
                                        ? <input type="text" inputMode="numeric" value={edit.price} onChange={(e) => setEdit({ ...edit, price: formatMoneyCents(e.target.value) })} />
                                        : money(num(lot.price))}</td>
                                      <td className="amount-col">{money(num(lot.shares) * num(lot.price))}</td>
                                      <td>{editing
                                        ? <input type="text" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
                                        : lot.notes}</td>
                                      {canWrite && (
                                        <td>
                                          {editing ? (
                                            <>
                                              <button className="icon-btn icon-btn--save" onClick={() => updateLot.mutate(lot)}
                                                disabled={updateLot.isPending || !(parseFloat(edit.shares) > 0) || edit.price === ''} aria-label="Save"><Check size={15} /></button>
                                              <button className="icon-btn icon-btn--cancel" onClick={() => setEditId(null)} aria-label="Cancel"><X size={15} /></button>
                                            </>
                                          ) : (
                                            <>
                                              <button className="icon-btn icon-btn--edit" onClick={() => startEdit(lot)} aria-label="Edit lot"><Pencil size={15} /></button>
                                              <button className="icon-btn icon-btn--delete" aria-label="Delete lot"
                                                onClick={() => { if (confirm(`Delete this ${lot.ticker} lot?`)) deleteLot.mutate(lot.id) }}><Trash2 size={15} /></button>
                                            </>
                                          )}
                                        </td>
                                      )}
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {!isLoading && positions.length === 0 && (
              <tr><td colSpan={canWrite ? 11 : 10} className="col-center">No holdings yet.{canWrite ? ' Use “Add lot”, or “Bought” on a Watchlist stock.' : ''}</td></tr>
            )}
          </tbody>
          {positions.length > 0 && (
            <tfoot>
              <tr className="budget-total-row">
                <td></td><td>Total</td><td></td><td></td><td></td>
                <td className="amount-col">{money(totalCost)}</td>
                <td></td>
                <td className="amount-col">{allPriced ? money(totalValue) : '—'}</td>
                <td className={`amount-col ${sign(totalGain)}`}>{money(totalGain)}</td>
                <td className={`amount-col ${sign(totalGain)}`}>{pct(totalGain === null || totalCost === 0 ? null : totalGain / totalCost)}</td>
                {canWrite && <td></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      </>}

      {canWrite && <AddLotModal dialogRef={dialogRef} />}
      {canWrite && <SellModal dialogRef={sellRef} target={sellTarget} />}
    </div>
  )
}
