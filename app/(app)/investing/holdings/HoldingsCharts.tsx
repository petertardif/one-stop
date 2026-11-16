'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { ChartLegendList, trimLegend, useIsMobile } from '@/components/ChartLegend'

/** One open position with its live valuation (null until its price has loaded). */
export interface PositionValue {
  ticker: string
  cost: number
  value: number | null
}

// Same palette as the Investments charts.
const COLORS = [
  '#2563eb', '#16a34a', '#db2777', '#f59e0b', '#7c3aed', '#0891b2',
  '#dc2626', '#65a30d', '#c026d3', '#ea580c', '#0d9488', '#4f46e5',
  '#ca8a04', '#be123c',
]

const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtUsdFull = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

type GainMode = 'usd' | 'pct'

/** Open tab: allocation by market value + unrealized gain/loss per ticker. */
export function HoldingsCharts({ positions }: { positions: PositionValue[] }) {
  const [mode, setMode] = useState<GainMode>('usd')
  const priced = useMemo(() => positions.filter((p): p is PositionValue & { value: number } => p.value !== null), [positions])

  const allocation = useMemo(
    () => priced.map((p) => ({ name: p.ticker, value: p.value })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value),
    [priced]
  )

  const isMobile = useIsMobile()
  const allocLegend = useMemo(() => trimLegend(
    allocation.map((x, i) => ({ key: x.name, label: x.name, color: COLORS[i % COLORS.length], size: x.value })),
    { enabled: isMobile, max: 5, top: 5 },
  ), [allocation, isMobile])

  // Biggest winner first; % is gain over cost basis.
  const gains = useMemo(
    () => priced
      .map((p) => {
        const usd = p.value - p.cost
        return { ticker: p.ticker, usd, pct: p.cost ? (usd / p.cost) * 100 : 0 }
      })
      .sort((a, b) => (mode === 'usd' ? b.usd - a.usd : b.pct - a.pct)),
    [priced, mode]
  )

  if (priced.length === 0) return null
  const fmtAxis = mode === 'usd' ? fmtUsd : (n: number) => `${n.toFixed(0)}%`

  return (
    <div className="inv-charts">
      <div className="inv-charts-top">
        <div className="inv-chart-card">
          <h2>Allocation</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={allocation} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={48} paddingAngle={1}>
                {allocation.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtUsdFull(Number(v))} />
              <Legend content={() => <ChartLegendList {...allocLegend} icon="square" />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="inv-chart-card">
          <div className="inv-chart-head">
            <h2>Gain / loss</h2>
            <div className="inv-dim-toggle">
              <button className={mode === 'usd' ? 'active' : ''} onClick={() => setMode('usd')}>$</button>
              <button className={mode === 'pct' ? 'active' : ''} onClick={() => setMode('pct')}>%</button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(260, gains.length * 28 + 40)}>
            <BarChart data={gains} layout="vertical" margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" horizontal={false} />
              <XAxis type="number" tickFormatter={fmtAxis} fontSize={11} />
              <YAxis type="category" dataKey="ticker" fontSize={11} width={56} />
              <ReferenceLine x={0} stroke="var(--text-subtle)" />
              <Tooltip formatter={(v) => (mode === 'usd' ? fmtUsdFull(Number(v)) : fmtPct(Number(v)))} />
              <Bar dataKey={mode} name={mode === 'usd' ? 'Gain $' : 'Gain %'}>
                {gains.map((g) => (
                  <Cell key={g.ticker} fill={g[mode] >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

/** One year's realized gains, split by term, with the estimated tax for that year. */
export interface RealizedYear {
  year: string
  short: number
  long: number
  tax: number
}

/** Sold tab: realized gains per year, short vs long term, next to the estimated tax. */
export function RealizedChart({ years }: { years: RealizedYear[] }) {
  if (years.length === 0) return null
  return (
    <div className="inv-charts">
      <div className="inv-chart-card">
        <h2>Realized gains by year</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={years} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
            <XAxis dataKey="year" fontSize={11} tickMargin={6} />
            <YAxis tickFormatter={fmtUsd} fontSize={11} width={64} />
            <ReferenceLine y={0} stroke="var(--text-subtle)" />
            <Tooltip formatter={(v) => fmtUsdFull(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="short" name="Short-term gain" stackId="gain" fill="#f59e0b" />
            <Bar dataKey="long" name="Long-term gain" stackId="gain" fill="#2563eb" />
            <Bar dataKey="tax" name="Est. tax" fill="#dc2626" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
