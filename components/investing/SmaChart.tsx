'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { SmaPoint } from '@/lib/indicators'

function fmt(v: unknown): string {
  if (typeof v !== 'number') return String(v)
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

export function SmaChart({ data }: { data: SmaPoint[] }) {
  const recent = data.slice(-120)
  const last = recent[recent.length - 1]
  return (
    <div className="chart-section">
      <p className="chart-section__title">
        10-Day Moving Average
        {last?.sma10 !== null && last?.sma10 !== undefined && (
          <span className={`chart-section__indicator ${last.aboveSma ? 'positive' : 'negative'}`}>
            {' '}· Price {last.aboveSma ? '↑ above' : '↓ below'} SMA10 ({fmt(last.sma10)})
          </span>
        )}
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={recent}>
          <XAxis dataKey="date" hide />
          <YAxis
            width={60}
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, border: '1px solid var(--surface-border)' }}
            formatter={fmt}
          />
          <Line type="monotone" dataKey="price" name="Price" stroke="var(--accent)" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="sma10" name="SMA10" stroke="#94a3b8" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
      <p className="chart-section__legend">
        <span style={{ color: 'var(--accent)' }}>— Price</span>
        {' · '}
        <span style={{ color: '#94a3b8' }}>- - SMA10</span>
      </p>
    </div>
  )
}
