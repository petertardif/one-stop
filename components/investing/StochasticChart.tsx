'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { StochPoint } from '@/lib/indicators'

export function StochasticChart({ data }: { data: StochPoint[] }) {
  const recent = data.slice(-120)
  return (
    <div className="chart-section">
      <p className="chart-section__title">Stochastic Oscillator (14, 3)</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={recent}>
          <XAxis dataKey="date" hide />
          <YAxis domain={[0, 100]} width={35} tick={{ fontSize: 11 }} />
          <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="4 2" label={{ value: '80', fontSize: 10, fill: '#ef4444' }} />
          <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="4 2" label={{ value: '20', fontSize: 10, fill: '#22c55e' }} />
          <Tooltip
            contentStyle={{ fontSize: 12, border: '1px solid var(--surface-border)' }}
            formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(1) : String(v)) as string}
          />
          <Line type="monotone" dataKey="k" name="%K" stroke="var(--accent)" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="d" name="%D" stroke="#94a3b8" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
      <p className="chart-section__legend">
        <span style={{ color: 'var(--accent)' }}>— %K</span>
        {' · '}
        <span style={{ color: '#94a3b8' }}>- - %D</span>
        {' · '}
        Overbought: 80 · Oversold: 20
      </p>
    </div>
  )
}
