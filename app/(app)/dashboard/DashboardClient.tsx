'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import Link from 'next/link'
import { CalendarClock, Receipt, Repeat, Car, CreditCard, Landmark } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useBusyHold, AUTH_REDIRECT_HOLD } from '@/components/BusyOverlay'

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
  debtTerms: Record<'short' | 'long', { remaining: number; paidThisYear: number }>
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

  // Sign-in keeps the overlay up across the redirect; this is the "dashboard is ready"
  // signal that clears it, so there is no blank gap between login and first paint.
  const { releaseHold } = useBusyHold()
  useEffect(() => {
    if (!isLoading) releaseHold(AUTH_REDIRECT_HOLD)
  }, [isLoading, releaseHold])

  if (isLoading || !data) return <Spinner />

  const { netWorth, netWorthHistory, cashFlow, weekly, monthlyBills, subscriptions, auto, debtTerms } = data
  const thisYear = new Date().getFullYear()
  const nwPositive = netWorth.netWorth >= 0

  // Spending gauge: the bar's full scale is whichever is larger, income or
  // expenses. Expenses fill from the left; the part past income turns red.
  const net = cashFlow.income - cashFlow.expenses
  const gaugeMax = Math.max(cashFlow.income, cashFlow.expenses) || 1
  const pct = (n: number) => `${(n / gaugeMax) * 100}%`
  const covered = Math.min(cashFlow.expenses, cashFlow.income)
  const over = Math.max(0, cashFlow.expenses - cashFlow.income)
  const savedPct = cashFlow.income > 0 ? Math.round((net / cashFlow.income) * 100) : null

  const nwChartData = netWorthHistory.map((p) => ({
    ...p,
    label: new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
  }))

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1>Welcome back, {firstName}</h1>
      </div>

      {/* Module summary tiles — each links to its section */}
      <section className="dashboard__section">
        <h2 className="dashboard__section-title">At a Glance</h2>
        <div className="dashboard__tiles">
          <Link href="/debts" className="dashboard-tile">
            <span className="dashboard-tile__label"><CreditCard size={16} /> Short Term Debt</span>
            <span className="dashboard-tile__value">{fmt(debtTerms.short.remaining)}</span>
            <span className="dashboard-tile__sub">{fmt(debtTerms.short.paidThisYear)} paid down in {thisYear}</span>
          </Link>
          <Link href="/debts" className="dashboard-tile">
            <span className="dashboard-tile__label"><Landmark size={16} /> Long Term Debt</span>
            <span className="dashboard-tile__value">{fmt(debtTerms.long.remaining)}</span>
            <span className="dashboard-tile__sub">{fmt(debtTerms.long.paidThisYear)} paid down in {thisYear}</span>
          </Link>
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

      {/* Monthly Cash Flow */}
      <section className="dashboard__section">
        <h2 className="dashboard__section-title">Cash Flow — {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
        {(cashFlow.income > 0 || cashFlow.expenses > 0) ? (
          <div className="cash-gauge">
            <div className={`cash-gauge__headline ${net >= 0 ? 'positive' : 'negative'}`}>
              {net >= 0 ? 'Saved' : 'Overspent'} {fmt(Math.abs(net))}
              {savedPct != null && <small>{Math.abs(savedPct)}% of income</small>}
            </div>
            <div className="cash-gauge__track" role="img"
              aria-label={`Expenses ${fmt(cashFlow.expenses)} of income ${fmt(cashFlow.income)}`}>
              <div className="cash-gauge__fill" style={{ width: pct(covered) }} />
              {over > 0 && <div className="cash-gauge__over" style={{ left: pct(covered), width: pct(over) }} />}
              <div className="cash-gauge__income-mark" style={{ left: pct(cashFlow.income) }} />
            </div>
            <div className="cash-gauge__labels">
              <span>Expenses <strong className="negative">{fmt(cashFlow.expenses)}</strong></span>
              <span>Income <strong className="positive">{fmt(cashFlow.income)}</strong></span>
            </div>
          </div>
        ) : (
          <p className="dashboard__empty">No transactions recorded this month.</p>
        )}
      </section>
    </div>
  )
}
