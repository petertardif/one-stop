'use client'

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'
import type { MacdPoint } from '@/lib/indicators'

export function MacdChart({ data }: { data: MacdPoint[] }) {
  const recent = data.slice(-120)
  return (
    <div className="chart-section">
      <p className="chart-section__title">MACD (12, 26, 9)</p>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={recent}>
          <XAxis dataKey="date" hide />
          <YAxis width={50} tick={{ fontSize: 11 }} />
          <ReferenceLine y={0} stroke="var(--surface-border)" />
          <Tooltip
            contentStyle={{ fontSize: 12, border: '1px solid var(--surface-border)' }}
            formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(3) : String(v)) as string}
          />
          <Bar dataKey="histogram" name="Histogram">
            {recent.map((entry, i) => (
              <Cell key={i} fill={entry.histogram >= 0 ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
          <Line type="monotone" dataKey="macd" name="MACD" stroke="var(--accent)" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="signal" name="Signal" stroke="#f97316" dot={false} strokeWidth={1.5} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="chart-section__legend">
        <span style={{ color: 'var(--accent)' }}>— MACD</span>
        {' · '}
        <span style={{ color: '#f97316' }}>— Signal</span>
        {' · '}
        <span style={{ color: '#22c55e' }}>▌ Histogram</span>
      </p>
    </div>
  )
}
