'use client'

import { useEffect, useState } from 'react'
import { Tooltip } from '@/components/Tooltip'

// Same breakpoint as the app's mobile layout (hamburger nav) in globals.css.
const MOBILE_QUERY = '(max-width: 768px)'

export function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const update = () => setMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return mobile
}

export interface LegendEntry {
  key: string
  label: string
  color: string
  /** Ranking value: the largest entries are the ones kept when trimming. */
  size: number
}

/**
 * Split legend entries for a crowded chart: when there are more than `max`
 * (counted by `count`, default entries.length), keep the `top` largest — in their
 * original order so colors still read left-to-right — and return the rest,
 * largest first, as hidden. Trimming only applies when `enabled` (e.g. mobile).
 */
export function trimLegend(
  entries: LegendEntry[],
  { enabled, max, top, count = entries.length }: { enabled: boolean; max: number; top: number; count?: number }
) {
  if (!enabled || count <= max) return { shown: entries, hidden: [] as LegendEntry[] }
  const ranked = [...entries].sort((a, b) => b.size - a.size)
  const keep = new Set(ranked.slice(0, top).map((e) => e.key))
  return { shown: entries.filter((e) => keep.has(e.key)), hidden: ranked.slice(top) }
}

/** Legend body for recharts' <Legend content>; "+N more" lists hidden names on hover. */
export function ChartLegendList({ shown, hidden, icon }: { shown: LegendEntry[]; hidden: LegendEntry[]; icon: 'line' | 'square' }) {
  return (
    <ul className="chart-legend">
      {shown.map((e) => (
        <li key={e.key} className="chart-legend__item" style={{ color: e.color }}>
          <svg width={14} height={14} aria-hidden>
            {icon === 'line'
              ? <line x1={0} y1={7} x2={14} y2={7} stroke={e.color} strokeWidth={2} />
              : <rect x={1} y={1} width={12} height={12} fill={e.color} />}
          </svg>
          {e.label}
        </li>
      ))}
      {hidden.length > 0 && (
        <li>
          <Tooltip text={hidden.map((e) => e.label).join(', ')}>
            <span tabIndex={0} className="chart-legend__more">+{hidden.length} more</span>
          </Tooltip>
        </li>
      )}
    </ul>
  )
}
