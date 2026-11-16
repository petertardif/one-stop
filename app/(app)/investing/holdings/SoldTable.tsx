'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArchiveRestore, ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { RealizedChart, RealizedYear } from './HoldingsCharts'
import { ColumnFilter } from '@/components/ColumnFilter'
import { Tooltip } from '@/components/Tooltip'
import { EditSoldModal } from './EditSoldModal'
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

/** Sold tab: one row per ticker (summing its sold lots), expandable to the lots themselves. */
export function SoldTable({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const [rates, setRates] = useState(DEFAULT_RATES)
  const [years, setYears] = useState<string[]>([])
  const [tickers, setTickers] = useState<string[]>([])
  const [companies, setCompanies] = useState<string[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const editRef = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState<HoldingLot | null>(null)

  function toggle(ticker: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker); else next.add(ticker)
      return next
    })
  }

  function openEdit(lot: HoldingLot) {
    setEditing(lot)
    requestAnimationFrame(() => editRef.current?.showModal())
  }

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

  // One group per ticker; Est. Tax nets the ticker's lots like the totals row does.
  const groupMap = new Map<string, typeof rows>()
  for (const row of rows) groupMap.set(row.lot.ticker, [...(groupMap.get(row.lot.ticker) ?? []), row])
  const groups = Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ticker, lotRows]) => {
      const t = estimateTax(lotRows, rateOf(false), rateOf(true))
      const dates = lotRows.map((x) => x.lot.sold_on ?? '').sort()
      return {
        ticker,
        company: lotRows[0].lot.company_name,
        lotRows,
        sold: dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} – ${dates[dates.length - 1]}`,
        shares: lotRows.reduce((sum, x) => sum + x.shares, 0),
        cost: lotRows.reduce((sum, x) => sum + x.cost, 0),
        proceeds: lotRows.reduce((sum, x) => sum + x.proceeds, 0),
        hasShort: lotRows.some((x) => !x.long),
        hasLong: lotRows.some((x) => x.long),
        netShort: t.netShort,
        netLong: t.netLong,
        tax: t.tax,
      }
    })

  // Term cell: the gain split by term, e.g. "S $120.00 / L $300.00".
  const termSplit = (g: (typeof groups)[number]) =>
    [g.hasShort ? `S ${money(g.netShort)}` : null, g.hasLong ? `L ${money(g.netLong)}` : null].filter(Boolean).join(' / ')
  const fmtShares = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 6 })
  const colCount = 11

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
            <th></th>
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
            <th>Term</th>
            <th className="amount-col">Est. Tax</th>
            <th className="amount-col">Shares</th>
            <th className="amount-col">Cost Basis</th>
            <th className="amount-col">Proceeds</th>
            <th className="amount-col">Gain $</th>
            <th className="amount-col">Gain %</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const open = expanded.has(g.ticker)
            const gain = g.proceeds - g.cost
            return (
              <Fragment key={g.ticker}>
                <tr>
                  <td>
                    <button className="icon-btn inv-expand" onClick={() => toggle(g.ticker)}
                      aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open}>
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </td>
                  <td>{g.sold}</td>
                  <td><strong>{g.ticker}</strong></td>
                  <td>{g.company}</td>
                  <td>{termSplit(g)}</td>
                  <td className="amount-col">{money(g.tax)}</td>
                  <td className="amount-col">{fmtShares(g.shares)}</td>
                  <td className="amount-col">{money(g.cost)}</td>
                  <td className="amount-col">{money(g.proceeds)}</td>
                  <td className={`amount-col ${sign(gain)}`}>{money(gain)}</td>
                  <td className={`amount-col ${sign(gain)}`}>{pct(g.cost ? gain / g.cost : null)}</td>
                </tr>
                {open && (
                  <tr className="inv-detail-row">
                    <td></td>
                    <td colSpan={colCount - 1}>
                      <div className="inv-detail">
                        <div className="inv-detail-history">
                          <h3>Sold lots</h3>
                          <table className="inv-history-table">
                            <thead>
                              <tr>
                                <th>Sold</th>
                                <th>Bought</th>
                                <th>Term</th>
                                <th className="amount-col">Shares</th>
                                <th className="amount-col">Buy Price</th>
                                <th className="amount-col">Fee</th>
                                <th className="amount-col">Sale Price</th>
                                <th className="amount-col">Sale Fee</th>
                                <th className="amount-col">Gain $</th>
                                <th className="amount-col">Est. Tax</th>
                                <th>Notes</th>
                                {canWrite && <th></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {g.lotRows.map(({ lot, shares, gain: lotGain, long, tax }) => (
                                <tr key={lot.id}>
                                  <td>{lot.sold_on}</td>
                                  <td>{lot.bought_on}</td>
                                  <td>{long ? 'Long' : 'Short'}</td>
                                  <td className="amount-col">{fmtShares(shares)}</td>
                                  <td className="amount-col">{money(parseFloat(lot.price))}</td>
                                  <td className="amount-col">{money(parseFloat(lot.fee))}</td>
                                  <td className="amount-col">{money(parseFloat(lot.sale_price ?? '0'))}</td>
                                  <td className="amount-col">{money(parseFloat(lot.sale_fee))}</td>
                                  <td className={`amount-col ${sign(lotGain)}`}>{money(lotGain)}</td>
                                  <td className="amount-col">{money(tax)}</td>
                                  <td>{lot.notes}</td>
                                  {canWrite && (
                                    <td>
                                      <Tooltip text="Edit this sold lot">
                                        <button className="icon-btn icon-btn--edit" aria-label="Edit sold lot" onClick={() => openEdit(lot)}>
                                          <Pencil size={15} />
                                        </button>
                                      </Tooltip>
                                      <Tooltip text="Undo sale: move back to Open">
                                        <button className="icon-btn icon-btn--edit" aria-label="Undo sale" disabled={restore.isPending}
                                          onClick={() => { if (confirm(`Undo this ${lot.ticker} sale? The lot goes back to Open.`)) restore.mutate(lot.id) }}>
                                          <ArchiveRestore size={15} />
                                        </button>
                                      </Tooltip>
                                      <Tooltip text="Delete this lot permanently">
                                        <button className="icon-btn icon-btn--delete" aria-label="Delete lot" disabled={remove.isPending}
                                          onClick={() => { if (confirm(`Permanently delete this sold ${lot.ticker} lot?`)) remove.mutate(lot.id) }}>
                                          <Trash2 size={15} />
                                        </button>
                                      </Tooltip>
                                    </td>
                                  )}
                                </tr>
                              ))}
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
          {groups.length === 0 && (
            <tr><td colSpan={colCount} className="col-center">{lots.length ? 'No sales match these filters.' : 'No sales yet.'}</td></tr>
          )}
        </tbody>
        {groups.length > 0 && (
          <tfoot>
            <tr className="budget-total-row">
              <td></td><td>Total</td><td></td><td></td><td></td>
              <td className="amount-col">{money(totalTax)}</td>
              <td></td>
              <td className="amount-col">{money(totalCost)}</td>
              <td className="amount-col">{money(totalProceeds)}</td>
              <td className={`amount-col ${sign(totalGain)}`}>{money(totalGain)}</td>
              <td className={`amount-col ${sign(totalGain)}`}>{pct(totalCost ? totalGain / totalCost : null)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
    {canWrite && <EditSoldModal dialogRef={editRef} lot={editing} />}
    </>
  )
}
