'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { DebtAccount, latestBalance, totalPaidOff } from './types'
import { valueOnOrBefore } from '@/lib/snapshots'

type Dimension = 'category' | 'debt'

// On the Paid Off tab the short-term debts are dozens of one-off line items, so
// they are rolled up into a single series/slice instead of one each.
const SHORT_TERM_LABEL = 'Short Term'

const COLORS = [
  '#dc2626', '#ea580c', '#d97706', '#ca8a04', '#65a30d', '#0891b2',
  '#2563eb', '#7c3aed', '#c026d3', '#db2777', '#0d9488', '#4f46e5',
  '#be123c', '#b45309',
]

// Carry-forward: the debt's most recent balance on or before `day` (null before
// its first snapshot). Shared with the dashboard net-worth trend.
const balanceAsOf = (d: DebtAccount, day: string): number | null =>
  valueOnOrBefore(d.snapshots, day, (s) => parseFloat(s.balance))

const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtUsdFull = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function DebtCharts({ rows, paidTab = false }: { rows: DebtAccount[]; paidTab?: boolean }) {
  const [dimension, setDimension] = useState<Dimension>('category')

  // All snapshot dates across the shown debts, ascending.
  const dates = useMemo(() => {
    const set = new Set<string>()
    for (const d of rows) for (const s of d.snapshots) set.add(s.as_of.slice(0, 10))
    return Array.from(set).sort()
  }, [rows])

  // Total debt per date: sum of every debt's carry-forward balance as of that
  // date, so a debt without a new snapshot still counts at its last known balance.
  const totalSeries = useMemo(
    () =>
      dates.map((day) => {
        let total = 0
        for (const d of rows) total += balanceAsOf(d, day) ?? 0
        return { date: day, total }
      }),
    [rows, dates]
  )

  // Label = debt name, disambiguated with category only when the name is shared.
  const nameCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of rows) m.set(d.name, (m.get(d.name) ?? 0) + 1)
    return m
  }, [rows])
  const labelFor = (d: DebtAccount) => {
    if ((nameCounts.get(d.name) ?? 0) <= 1) return d.name
    return d.category ? `${d.name} - ${d.category}` : d.name
  }

  // One line per debt — except on the Paid Off tab, where every short-term debt
  // collapses into a single "Short Term" line summing their balances.
  const series = useMemo(() => {
    const lines = (d: DebtAccount) => ({ key: d.id, label: labelFor(d), members: [d] })
    if (!paidTab) return rows.map(lines)

    const shortTerm = rows.filter((d) => d.term === 'short')
    const grouped = rows.filter((d) => d.term !== 'short').map(lines)
    return shortTerm.length > 0
      ? [{ key: 'short-term', label: SHORT_TERM_LABEL, members: shortTerm }, ...grouped]
      : grouped
  }, [rows, paidTab, nameCounts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Per-series balance across the snapshot dates.
  const perDebtSeries = useMemo(
    () =>
      dates.map((day) => {
        const row: Record<string, number | string | null> = { date: day }
        for (const g of series) {
          let total: number | null = null
          for (const d of g.members) {
            const b = balanceAsOf(d, day)
            if (b !== null) total = (total ?? 0) + b
          }
          row[g.key] = total
        }
        return row
      }),
    [series, dates]
  )

  // Allocation per debt, grouped by category or debt name. The Paid Off tab
  // measures each debt by what was actually paid off (its peak balance — the
  // latest balance there is 0) and rolls all short-term debts into one slice.
  const allocation = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of rows) {
      const key = paidTab && d.term === 'short'
        ? SHORT_TERM_LABEL
        : (dimension === 'category' ? d.category : d.name) || 'Uncategorized'
      map.set(key, (map.get(key) ?? 0) + (paidTab ? totalPaidOff(d) : latestBalance(d)))
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [rows, dimension, paidTab])

  if (rows.length === 0) return null

  return (
    <div className="inv-charts">
      <div className="inv-charts-top">
        <div className="inv-chart-card">
          <h2>Total debt over time</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={totalSeries} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="debtTotalFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dc2626" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
              <XAxis dataKey="date" fontSize={11} tickMargin={6} />
              <YAxis tickFormatter={fmtUsd} fontSize={11} width={64} />
              <Tooltip formatter={(v) => fmtUsdFull(Number(v))} />
              <Area type="monotone" dataKey="total" name="Total debt" stroke="#dc2626" strokeWidth={2} fill="url(#debtTotalFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="inv-chart-card">
          <div className="inv-chart-head">
            <h2>Allocation</h2>
            <div className="inv-dim-toggle">
              <button className={dimension === 'category' ? 'active' : ''} onClick={() => setDimension('category')}>Category</button>
              <button className={dimension === 'debt' ? 'active' : ''} onClick={() => setDimension('debt')}>Debt</button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={allocation} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={48} paddingAngle={1}>
                {allocation.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtUsdFull(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="inv-chart-card">
        <h2>Per-debt balance over time</h2>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={perDebtSeries} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
            <XAxis dataKey="date" fontSize={11} tickMargin={6} />
            <YAxis tickFormatter={fmtUsd} fontSize={11} width={64} />
            <Tooltip formatter={(v) => fmtUsdFull(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map((g, i) => (
              <Line
                key={g.key}
                type="monotone"
                dataKey={g.key}
                name={g.label}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={1.75}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
