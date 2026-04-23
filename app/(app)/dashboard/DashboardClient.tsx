'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'
import Link from 'next/link'
import { Pencil, Plus, Check, X } from 'lucide-react'
import { useState, useRef } from 'react'
import { Spinner } from '@/components/Spinner'
import { PlaidLinkButton } from '@/components/PlaidLinkButton'

interface Account {
  id: string
  name: string
  institution: string | null
  type: string
  balance: string
  currency: string
  plaid_account_id: string | null
  last_synced_at: string | null
  interest_rate: string | null
  minimum_payment: string | null
}

interface NetWorthPoint {
  date: string
  netWorth: number
}

interface DashboardData {
  netWorth: { assets: number; liabilities: number; netWorth: number }
  accountsByType: Record<string, Account[]>
  cashFlow: { income: number; expenses: number }
  debts: Account[]
  netWorthHistory: NetWorthPoint[]
}

const GROUP_ORDER = ['Checking & Savings', 'Investments', 'Real Estate', 'Debt']

const DEBT_LABEL: Record<string, string> = {
  credit_card: 'Credit Card',
  mortgage: 'Mortgage',
  car_loan: 'Car Loan',
  student_loan: 'Student Loan',
  other_debt: 'Other Debt',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtPct(n: number | null) {
  if (n === null) return '—'
  return `${n.toFixed(2)}%`
}

type PayoffMethod = 'avalanche' | 'snowball'

function payoffOrder(debts: Account[], method: PayoffMethod): Account[] {
  if (method === 'avalanche') {
    return [...debts].sort((a, b) => {
      const rA = a.interest_rate ? parseFloat(a.interest_rate) : 0
      const rB = b.interest_rate ? parseFloat(b.interest_rate) : 0
      return rB - rA
    })
  }
  return [...debts].sort((a, b) =>
    Math.abs(parseFloat(a.balance)) - Math.abs(parseFloat(b.balance))
  )
}

export function DashboardClient({ firstName, isAdmin }: { firstName: string; isAdmin: boolean }) {
  const queryClient = useQueryClient()
  const [editingBalance, setEditingBalance] = useState<string | null>(null)
  const balanceInputRef = useRef<HTMLInputElement>(null)
  const [payoffMethod, setPayoffMethod] = useState<PayoffMethod>('avalanche')

  async function saveBalance(accountId: string, value: string) {
    const num = parseFloat(value)
    if (isNaN(num)) { setEditingBalance(null); return }
    await fetch(`/api/accounts/${accountId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance: num }),
    })
    setEditingBalance(null)
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error('Failed to load dashboard')
      return res.json()
    },
  })

  if (isLoading || !data) return <Spinner />

  const { netWorth, accountsByType, cashFlow, debts, netWorthHistory } = data
  const nwPositive = netWorth.netWorth >= 0

  const cashFlowChartData = [
    { name: 'Income', value: cashFlow.income },
    { name: 'Expenses', value: cashFlow.expenses },
  ]

  const orderedDebts = payoffOrder(debts, payoffMethod)
  const hasDebtDetails = debts.some((d) => d.interest_rate || d.minimum_payment)

  const nwChartData = netWorthHistory.map((p) => ({
    ...p,
    label: new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
  }))

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1>Welcome back, {firstName}</h1>
      </div>

      {/* Net Worth */}
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
                <Tooltip
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

      {/* Accounts Panel + Cash Flow side by side */}
      <div className="dashboard__row">
        {/* Accounts Panel */}
        <section className="dashboard__section dashboard__section--accounts">
          <div className="dashboard__section-header">
            <h2 className="dashboard__section-title">Accounts</h2>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                <PlaidLinkButton />
                <Link href="/dashboard/accounts/new" className="btn-sm btn-secondary">
                  <Plus size={14} /> Account
                </Link>
              </div>
            )}
          </div>
          {GROUP_ORDER.map((group) => {
            const accounts = accountsByType[group]
            if (!accounts?.length) return null
            const groupTotal = accounts.reduce((s, a) => s + parseFloat(a.balance), 0)
            return (
              <div key={group} className="accounts-group">
                <div className="accounts-group__header">
                  <span>{group}</span>
                  <span className={groupTotal >= 0 ? 'positive' : 'negative'}>{fmt(Math.abs(groupTotal))}</span>
                </div>
                {accounts.map((acct) => (
                  <div key={acct.id} className="account-row">
                    <div className="account-row__info">
                      <span className="account-row__name">{acct.name}</span>
                      {acct.institution && (
                        <span className="account-row__institution">{acct.institution}</span>
                      )}
                    </div>
                    <div className="account-row__right">
                      {editingBalance === acct.id ? (
                        <div className="account-row__balance-edit">
                          <input
                            ref={balanceInputRef}
                            type="number"
                            step="0.01"
                            defaultValue={parseFloat(acct.balance)}
                            className="account-row__balance-input"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveBalance(acct.id, e.currentTarget.value)
                              if (e.key === 'Escape') setEditingBalance(null)
                            }}
                          />
                          <button className="btn-icon" title="Save" onClick={() => saveBalance(acct.id, balanceInputRef.current?.value ?? '')}>
                            <Check size={13} />
                          </button>
                          <button className="btn-icon" title="Cancel" onClick={() => setEditingBalance(null)}>
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className={`account-row__balance ${parseFloat(acct.balance) >= 0 ? 'positive' : 'negative'}`}>
                            {fmt(Math.abs(parseFloat(acct.balance)))}
                          </span>
                          {acct.last_synced_at && (
                            <span className="account-row__synced">Synced {fmtDate(acct.last_synced_at)}</span>
                          )}
                          {isAdmin && (
                            <button
                              className="account-row__edit"
                              title="Update balance"
                              onClick={() => setEditingBalance(acct.id)}
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
          {Object.keys(accountsByType).length === 0 && (
            <p className="dashboard__empty">No accounts yet. Add an account to get started.</p>
          )}
        </section>

        {/* Right column: Cash Flow + Debt */}
        <div className="dashboard__col">
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
                    <Tooltip
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

          {isAdmin && (
            <div className="dashboard__action-row">
              <Link href="/dashboard/transactions/new" className="btn-sm btn-secondary">
                <Plus size={14} /> Log transaction
              </Link>
            </div>
          )}

          {/* Debt Snapshot */}
          <section className="dashboard__section">
            <div className="dashboard__section-header">
              <h2 className="dashboard__section-title">Debt Snapshot</h2>
              {debts.length > 0 && (
                <div className="payoff-toggle">
                  <button
                    className={`payoff-toggle__btn${payoffMethod === 'avalanche' ? ' payoff-toggle__btn--active' : ''}`}
                    onClick={() => setPayoffMethod('avalanche')}
                    title="Highest interest rate first"
                  >
                    Avalanche
                  </button>
                  <button
                    className={`payoff-toggle__btn${payoffMethod === 'snowball' ? ' payoff-toggle__btn--active' : ''}`}
                    onClick={() => setPayoffMethod('snowball')}
                    title="Lowest balance first"
                  >
                    Snowball
                  </button>
                </div>
              )}
            </div>
            {debts.length > 0 ? (
              <>
                <div className="stat-cards stat-cards--small">
                  <div className="stat-card">
                    <span className="stat-card__label">Total Debt</span>
                    <span className="stat-card__value stat-card--negative">
                      {fmt(debts.reduce((s, d) => s + Math.abs(parseFloat(d.balance)), 0))}
                    </span>
                  </div>
                </div>
                <table className="debt-table">
                  <thead>
                    <tr>
                      <th>Priority</th>
                      <th>Account</th>
                      <th>Type</th>
                      <th className="col-right">Balance</th>
                      {hasDebtDetails && <th className="col-right">Rate</th>}
                      {hasDebtDetails && <th className="col-right">Min. Payment</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {orderedDebts.map((d, i) => (
                      <tr key={d.id}>
                        <td className="debt-priority">{i + 1}</td>
                        <td>{d.name}</td>
                        <td>{DEBT_LABEL[d.type] ?? d.type}</td>
                        <td className="col-right negative">{fmt(Math.abs(parseFloat(d.balance)))}</td>
                        {hasDebtDetails && (
                          <td className="col-right">{d.interest_rate ? fmtPct(parseFloat(d.interest_rate)) : '—'}</td>
                        )}
                        {hasDebtDetails && (
                          <td className="col-right">{d.minimum_payment ? fmt(parseFloat(d.minimum_payment)) : '—'}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="debt-method-hint">
                  {payoffMethod === 'avalanche'
                    ? 'Avalanche: pay minimums on all, put extra toward highest-rate debt first. Saves the most interest.'
                    : 'Snowball: pay minimums on all, put extra toward smallest balance first. Builds momentum.'}
                </p>
              </>
            ) : (
              <p className="dashboard__empty">No debt accounts.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
