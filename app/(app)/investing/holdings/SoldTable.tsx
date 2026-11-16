'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArchiveRestore, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { RealizedChart, RealizedYear } from './HoldingsCharts'
import { ColumnFilter } from '@/components/ColumnFilter'
import type { HoldingLot } from '@/lib/holdings'

const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const pct = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`)
const sign = (v: number | null) => (v === null ? '' : v >= 0 ? 'positive' : 'negative')

const RATES_KEY = 'holdings-tax-rates'
const DEFAULT_RATES = { short: '24', long: '15' }

/**
 * Long-term when held more than one year: sold after the purchase anniversary (IRS rule).
 * String compare on YYYY-MM-DD; a Feb 29 purchase turns long-term on Mar 1.
 */
function isLongTerm(bought: string, sold: string) {
  const anniversary = `${Number(bought.slice(0, 4)) + 1}${bought.slice(4)}`
  return sold > anniversary
}

/**
 * Estimated tax on a set of sales: losses offset gains within each term first, then
 * across terms; a net loss owes nothing.
 */
function estimateTax(rows: { gain: number; long: boolean }[], shortRate: number, longRate: number) {
  const netShort = rows.filter((r) => !r.long).reduce((s, r) => s + r.gain, 0)
  const netLong = rows.filter((r) => r.long).reduce((s, r) => s + r.gain, 0)
  let taxShort = netShort, taxLong = netLong
  if (netShort < 0 && netLong > 0) { taxLong = Math.max(0, netLong + netShort); taxShort = 0 }
  if (netLong < 0 && netShort > 0) { taxShort = Math.max(0, netShort + netLong); taxLong = 0 }
  return { netShort, netLong, tax: Math.max(0, taxShort) * shortRate + Math.max(0, taxLong) * longRate }
}

async function send(url: string, method: string) {
  const res = await fetch(url, { method })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
}

/** Sold tab: one row per sold lot with its realized gain. */
export function SoldTable({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const [rates, setRates] = useState(DEFAULT_RATES)
  const [years, setYears] = useState<string[]>([])
  const [tickers, setTickers] = useState<string[]>([])
  const [companies, setCompanies] = useState<string[]>([])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RATES_KEY)
      if (saved) setRates({ ...DEFAULT_RATES, ...(JSON.parse(saved) as Partial<typeof DEFAULT_RATES>) })
    } catch { /* storage unavailable: keep defaults */ }
  }, [])

  function setRate(term: 'short' | 'long', value: string) {
    const next = { ...rates, [term]: value }
    setRates(next)
    try { localStorage.setItem(RATES_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }
  const rateOf = (long: boolean) => (parseFloat(long ? rates.long : rates.short) || 0) / 100
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

  const uniq = (vals: string[]) => Array.from(new Set(vals)).sort().map((v) => ({ value: v, label: v }))
  const yearOptions = uniq(lots.map((l) => (l.sold_on ?? '').slice(0, 4))).reverse()
  const tickerOptions = uniq(lots.map((l) => l.ticker))
  const companyOptions = uniq(lots.map((l) => l.company_name))
  const visible = lots.filter((l) =>
    (years.length === 0 || years.includes((l.sold_on ?? '').slice(0, 4))) &&
    (tickers.length === 0 || tickers.includes(l.ticker)) &&
    (companies.length === 0 || companies.includes(l.company_name)))

  const rows = visible.map((lot) => {
    const shares = parseFloat(lot.shares)
    const cost = shares * parseFloat(lot.price) + parseFloat(lot.fee)
    const proceeds = shares * parseFloat(lot.sale_price ?? '0') - parseFloat(lot.sale_fee)
    const gain = proceeds - cost
    const long = lot.sold_on ? isLongTerm(lot.bought_on, lot.sold_on) : false
    return { lot, shares, cost, proceeds, gain, long, tax: gain * rateOf(long) }
  })
  const totalCost = rows.reduce((s, r) => s + r.cost, 0)
  const totalProceeds = rows.reduce((s, r) => s + r.proceeds, 0)
  const totalGain = totalProceeds - totalCost
  const totalTax = estimateTax(rows, rateOf(false), rateOf(true)).tax

  // Chart: one bar group per sale year (oldest first), taxed year by year.
  const byYear = new Map<string, typeof rows>()
  for (const r of rows) {
    const y = (r.lot.sold_on ?? '').slice(0, 4)
    byYear.set(y, [...(byYear.get(y) ?? []), r])
  }
  const realized: RealizedYear[] = Array.from(byYear.keys()).sort().map((year) => {
    const t = estimateTax(byYear.get(year) ?? [], rateOf(false), rateOf(true))
    return { year, short: t.netShort, long: t.netLong, tax: t.tax }
  })

  if (isLoading) return <Spinner />

  return (
    <>
    <RealizedChart years={realized} />
    <div className="holdings-tax-rates">
      <label>Short-term rate <input type="number" min="0" max="100" step="0.1" value={rates.short}
        onChange={(e) => setRate('short', e.target.value)} />%</label>
      <label>Long-term rate <input type="number" min="0" max="100" step="0.1" value={rates.long}
        onChange={(e) => setRate('long', e.target.value)} />%</label>
      <span className="text-muted">Estimate only. Short-term (held 1 year or less) is taxed as ordinary income.</span>
    </div>
    <div className="ledger-table-wrap">
      <table className="ledger-table">
        <thead>
          <tr>
            <th>
              <ColumnFilter label="Sold" mode="multi" allLabel="All Years" options={yearOptions}
                selected={years} onChange={setYears} summary={years.length ? years.join(', ') : null} />
            </th>
            <th>
              <ColumnFilter label="Ticker" mode="multi" allLabel="All Tickers" options={tickerOptions}
                selected={tickers} onChange={setTickers} summary={tickers.length ? String(tickers.length) : null} />
            </th>
            <th>
              <ColumnFilter label="Company" mode="multi" allLabel="All Companies" options={companyOptions}
                selected={companies} onChange={setCompanies} summary={companies.length ? String(companies.length) : null} />
            </th>
            <th>Bought</th>
            <th className="amount-col">Shares</th>
            <th className="amount-col">Buy Price</th>
            <th className="amount-col">Sale Price</th>
            <th className="amount-col">Cost Basis</th>
            <th className="amount-col">Proceeds</th>
            <th className="amount-col">Gain $</th>
            <th className="amount-col">Gain %</th>
            <th>Term</th>
            <th className="amount-col">Est. Tax</th>
            {canWrite && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ lot, shares, cost, proceeds, gain, long, tax }) => (
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
              <td>{long ? 'Long' : 'Short'}</td>
              <td className="amount-col">{money(tax)}</td>
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
            <tr><td colSpan={canWrite ? 14 : 13} className="col-center">{lots.length ? 'No sales match these filters.' : 'No sales yet.'}</td></tr>
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
              <td></td>
              <td className="amount-col">{money(totalTax)}</td>
              {canWrite && <td></td>}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
    </>
  )
}
