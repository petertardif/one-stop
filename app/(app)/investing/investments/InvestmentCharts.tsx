'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { Investment, latestValue } from './types'
import { valueOnOrBefore } from '@/lib/snapshots'

type Dimension = 'owner' | 'type'

const COLORS = [
  '#2563eb', '#16a34a', '#db2777', '#f59e0b', '#7c3aed', '#0891b2',
  '#dc2626', '#65a30d', '#c026d3', '#ea580c', '#0d9488', '#4f46e5',
  '#ca8a04', '#be123c',
]

// Carry-forward: the account's most recent value on or before `day` (null before
// its first snapshot). Shared with the dashboard net-worth trend.
const valueAsOf = (inv: Investment, day: string): number | null =>
  valueOnOrBefore(inv.snapshots, day, (s) => parseFloat(s.value))

const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtUsdFull = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function InvestmentCharts({ rows }: { rows: Investment[] }) {
  const [dimension, setDimension] = useState<Dimension>('type')

  // All snapshot dates across the portfolio, ascending.
  const dates = useMemo(() => {
    const set = new Set<string>()
    for (const inv of rows) for (const s of inv.snapshots) set.add(s.as_of.slice(0, 10))
    return Array.from(set).sort()
  }, [rows])

  // Portfolio total per date: sum of every account's carry-forward value as of
  // that date, so an account without a new snapshot still counts at its last value.
  const totalSeries = useMemo(
    () =>
      dates.map((d) => {
        let total = 0
        for (const inv of rows) total += valueAsOf(inv, d) ?? 0
        return { date: d, total }
      }),
    [rows, dates]
  )

  // Per-account growth: one series column per account, keyed by unique id so
  // accounts that share a brokerage name don't collide onto the same series.
  // Carry-forward each account's value; null before its first snapshot (a gap).
  const perAccountSeries = useMemo(
    () =>
      dates.map((d) => {
        const row: Record<string, number | string | null> = { date: d }
        for (const inv of rows) row[inv.id] = valueAsOf(inv, d)
        return row
      }),
    [rows, dates]
  )

  // Allocation of the latest value per account, grouped by owner or type.
  const allocation = useMemo(() => {
    const map = new Map<string, number>()
    for (const inv of rows) {
      const key = (dimension === 'owner' ? inv.owner : inv.type) || 'Unassigned'
      map.set(key, (map.get(key) ?? 0) + latestValue(inv))
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [rows, dimension])

  // Label = brokerage, disambiguated with the type only when the brokerage name
  // is shared by more than one account (falls back to owner if type is blank).
  const brokerageCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const inv of rows) m.set(inv.brokerage, (m.get(inv.brokerage) ?? 0) + 1)
    return m
  }, [rows])
  const labelFor = (inv: Investment) => {
    if ((brokerageCounts.get(inv.brokerage) ?? 0) <= 1) return inv.brokerage
    const suffix = inv.type || inv.owner
    return suffix ? `${inv.brokerage} - ${suffix}` : inv.brokerage
  }

  if (rows.length === 0) return null

  return (
    <div className="inv-charts">
      <div className="inv-charts-top">
        <div className="inv-chart-card">
          <h2>Portfolio value over time</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={totalSeries} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="totalFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
              <XAxis dataKey="date" fontSize={11} tickMargin={6} />
              <YAxis tickFormatter={fmtUsd} fontSize={11} width={64} />
              <Tooltip formatter={(v) => fmtUsdFull(Number(v))} />
              <Area type="monotone" dataKey="total" name="Total" stroke="#2563eb" strokeWidth={2} fill="url(#totalFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="inv-chart-card">
          <div className="inv-chart-head">
            <h2>Allocation</h2>
            <div className="inv-dim-toggle">
              <button className={dimension === 'type' ? 'active' : ''} onClick={() => setDimension('type')}>Type</button>
              <button className={dimension === 'owner' ? 'active' : ''} onClick={() => setDimension('owner')}>Owner</button>
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
        <h2>Per-account growth</h2>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={perAccountSeries} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
            <XAxis dataKey="date" fontSize={11} tickMargin={6} />
            <YAxis tickFormatter={fmtUsd} fontSize={11} width={64} />
            <Tooltip formatter={(v) => fmtUsdFull(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {rows.map((inv, i) => (
              <Line
                key={inv.id}
                type="monotone"
                dataKey={inv.id}
                name={labelFor(inv)}
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
