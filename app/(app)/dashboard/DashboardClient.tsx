'use client'

import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'
import Link from 'next/link'
import { CalendarClock, Receipt, Repeat, Car } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

interface NetWorthPoint {
  date: string
  assets: number
  liabilities: number
  netWorth: number
}

interface DashboardData {
  netWorth: { assets: number; liabilities: number; netWorth: number }
  netWorthHistory: NetWorthPoint[]
  cashFlow: { income: number; expenses: number }
  weekly: { week_start: string; remaining: number; spent: number }
  monthlyBills: { nextMonthly: number; monthlyAverage: number }
  subscriptions: { perYear: number; perMonth: number }
  auto: { ytd: number }
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function userTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function DashboardClient({ firstName }: { firstName: string }) {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?tz=${encodeURIComponent(userTz())}`)
      if (!res.ok) throw new Error('Failed to load dashboard')
      return res.json()
    },
  })

  if (isLoading || !data) return <Spinner />

  const { netWorth, netWorthHistory, cashFlow, weekly, monthlyBills, subscriptions, auto } = data
  const nwPositive = netWorth.netWorth >= 0

  const cashFlowChartData = [
    { name: 'Income', value: cashFlow.income },
    { name: 'Expenses', value: cashFlow.expenses },
  ]

  const nwChartData = netWorthHistory.map((p) => ({
    ...p,
    label: new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
  }))

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1>Welcome back, {firstName}</h1>
      </div>

      {/* Net Worth (Investments − Debts) */}
      <section className="dashboard__section">
        <h2 className="dashboard__section-title">Net Worth</h2>
        <div className="stat-cards">
          <div className="stat-card">
            <span className="stat-card__label">Total Assets</span>
            <span className="stat-card__value stat-card--positive">{fmt(netWorth.assets)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Total Liabilities</span>
            <span className="stat-card__value stat-card--negative">{fmt(netWorth.liabilities)}</span>
          </div>
          <div className={`stat-card stat-card--large ${nwPositive ? 'stat-card--positive-bg' : 'stat-card--negative-bg'}`}>
            <span className="stat-card__label">Net Worth</span>
            <span className={`stat-card__value ${nwPositive ? 'stat-card--positive' : 'stat-card--negative'}`}>
              {fmt(netWorth.netWorth)}
            </span>
          </div>
        </div>

        {nwChartData.length > 1 && (
          <div className="chart-wrap" style={{ marginTop: 'var(--spacing-md)' }}>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={nwChartData}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis
                  width={70}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  tickFormatter={(v) => fmt(Number(v))}
                  axisLine={false}
                  tickLine={false}
                />
                <ReferenceLine y={0} stroke="var(--surface-border)" />
                <ChartTooltip
                  formatter={(v) => fmt(Number(v))}
                  labelFormatter={(l) => l}
                  contentStyle={{ border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="netWorth"
                  name="Net Worth"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={nwChartData.length <= 12}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Module summary tiles — each links to its section */}
      <section className="dashboard__section">
        <h2 className="dashboard__section-title">At a Glance</h2>
        <div className="dashboard__tiles">
          <Link href="/monthly" className="dashboard-tile">
            <span className="dashboard-tile__label"><CalendarClock size={16} /> This Week&apos;s 1k</span>
            <span className={`dashboard-tile__value ${weekly.remaining < 0 ? 'negative' : ''}`}>{fmt(weekly.remaining)}</span>
            <span className="dashboard-tile__sub">{fmt(weekly.spent)} spent</span>
          </Link>
          <Link href="/budget" className="dashboard-tile">
            <span className="dashboard-tile__label"><Receipt size={16} /> Monthly Bills</span>
            <span className="dashboard-tile__value">{fmt(monthlyBills.nextMonthly)}<small>/mo</small></span>
            <span className="dashboard-tile__sub">12-mo avg {fmt(monthlyBills.monthlyAverage)}</span>
          </Link>
          <Link href="/subscriptions" className="dashboard-tile">
            <span className="dashboard-tile__label"><Repeat size={16} /> Subscriptions</span>
            <span className="dashboard-tile__value">{fmt(subscriptions.perYear)}<small>/yr</small></span>
            <span className="dashboard-tile__sub">{fmt(subscriptions.perMonth)}/mo</span>
          </Link>
          <Link href="/auto" className="dashboard-tile">
            <span className="dashboard-tile__label"><Car size={16} /> Auto Service</span>
            <span className="dashboard-tile__value">{fmt(auto.ytd)}</span>
            <span className="dashboard-tile__sub">this year</span>
          </Link>
        </div>
      </section>

      {/* Monthly Cash Flow */}
      <section className="dashboard__section">
        <h2 className="dashboard__section-title">Cash Flow — {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
        <div className="stat-cards stat-cards--small">
          <div className="stat-card">
            <span className="stat-card__label">Income</span>
            <span className="stat-card__value stat-card--positive">{fmt(cashFlow.income)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Expenses</span>
            <span className="stat-card__value stat-card--negative">{fmt(cashFlow.expenses)}</span>
          </div>
        </div>
        {(cashFlow.income > 0 || cashFlow.expenses > 0) ? (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={cashFlowChartData} barCategoryGap="40%">
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                <YAxis hide />
                <ChartTooltip
                  formatter={(v) => fmt(Number(v))}
                  contentStyle={{ border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  <Cell fill="#22c55e" />
                  <Cell fill="#ef4444" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="dashboard__empty">No transactions recorded this month.</p>
        )}
      </section>
    </div>
  )
}
