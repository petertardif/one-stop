import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { resolveTimeZone } from '@/lib/timezone'
import { getWeeklyBudget } from '@/lib/weeklyBudget'
import { valueOnOrBefore } from '@/lib/snapshots'

// The dashboard is derived entirely from the feature modules (Investments, Debts,
// Ledger, Budget, Subscriptions, Auto) — not the legacy `accounts` table. Net
// worth = active investments (assets) − active debts (liabilities), with an
// over-time trend built by carrying each account's latest snapshot forward.

interface SnapRow {
  account_id: string
  as_of: string
  amount: string
}

interface SnapPoint {
  as_of: string
  amount: number
}
type AcctSeries = Map<string, SnapPoint[]>

function groupByAccount(rows: SnapRow[]): AcctSeries {
  const m: AcctSeries = new Map()
  for (const r of rows) {
    const arr = m.get(r.account_id) ?? []
    arr.push({ as_of: r.as_of, amount: parseFloat(r.amount) })
    m.set(r.account_id, arr)
  }
  return m
}

const sumAsOf = (series: AcctSeries, day: string): number =>
  Array.from(series.values()).reduce(
    (s, arr) => s + (valueOnOrBefore<SnapPoint>(arr, day, (x) => x.amount) ?? 0),
    0
  )

// "Today" in the caller's timezone as YYYY-MM-DD (en-CA formats that way).
const todayInTz = (tz: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())

function subtractMonths(day: string, months: number): string {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const tz = resolveTimeZone(new URL(req.url).searchParams.get('tz'))

  const [invSnaps, debtSnaps, cashFlow, monthlyAvg, nextMonthly, subs, auto, weekly] = await Promise.all([
    query<SnapRow>(
      `SELECT s.investment_id AS account_id, to_char(s.as_of, 'YYYY-MM-DD') AS as_of, s.value AS amount
       FROM investment_snapshots s
       JOIN investments i ON i.id = s.investment_id
       WHERE i.user_id = $1 AND i.liquidated_at IS NULL`,
      [userId]
    ),
    query<SnapRow>(
      `SELECT s.debt_account_id AS account_id, to_char(s.as_of, 'YYYY-MM-DD') AS as_of, s.balance AS amount
       FROM debt_snapshots s
       JOIN debt_accounts d ON d.id = s.debt_account_id
       WHERE d.user_id = $1 AND d.paid_at IS NULL`,
      [userId]
    ),
    query<{ type: string; total: string }>(
      `SELECT type, SUM(amount) AS total
       FROM transactions
       WHERE user_id = $1
         AND date >= date_trunc('month', CURRENT_DATE)
         AND date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
       GROUP BY type`,
      [userId]
    ),
    query<{ monthly_average: string }>(
      `SELECT COALESCE(-SUM(amount), 0) / 12 AS monthly_average
       FROM transactions
       WHERE user_id = $1 AND category = 'MONTHLY BILLS'
         AND date >= (CURRENT_DATE - INTERVAL '12 months')`,
      [userId]
    ),
    query<{ next_monthly: string }>(
      `SELECT COALESCE(SUM(amount * CASE duration
                 WHEN 'annual' THEN 1 WHEN 'monthly' THEN 12
                 WHEN 'biweekly' THEN 26 WHEN 'weekly' THEN 52 ELSE 1 END) / 12, 0) AS next_monthly
       FROM budget_items
       WHERE user_id = $1 AND archived_at IS NULL`,
      [userId]
    ),
    query<{ per_year: string; per_month: string }>(
      `SELECT COALESCE(SUM(price_per_year), 0) AS per_year,
              COALESCE(SUM(price_per_month), 0) AS per_month
       FROM subscriptions
       WHERE user_id = $1 AND cancelled_at IS NULL`,
      [userId]
    ),
    query<{ ytd: string }>(
      `SELECT COALESCE(SUM(cost), 0) AS ytd
       FROM auto_services
       WHERE user_id = $1 AND date >= date_trunc('year', CURRENT_DATE)`,
      [userId]
    ),
    getWeeklyBudget(userId, null, tz),
  ])

  const today = todayInTz(tz)
  const invByAcct = groupByAccount(invSnaps.rows)
  const debtByAcct = groupByAccount(debtSnaps.rows)

  const assets = sumAsOf(invByAcct, today)
  const liabilities = sumAsOf(debtByAcct, today)

  // Net-worth trend: every distinct snapshot date (plus today), carried forward
  // per account, limited to the last 12 months.
  const cutoff = subtractMonths(today, 12)
  const dateSet = new Set<string>([today])
  for (const arr of [...Array.from(invByAcct.values()), ...Array.from(debtByAcct.values())]) {
    for (const s of arr) dateSet.add(s.as_of)
  }
  const netWorthHistory = Array.from(dateSet)
    .filter((d) => d >= cutoff)
    .sort()
    .map((day) => {
      const a = sumAsOf(invByAcct, day)
      const l = sumAsOf(debtByAcct, day)
      return { date: day, assets: a, liabilities: l, netWorth: a - l }
    })

  const income = cashFlow.rows.find((r) => r.type === 'income')
  const expenses = cashFlow.rows.find((r) => r.type === 'expense')

  return NextResponse.json({
    netWorth: { assets, liabilities, netWorth: assets - liabilities },
    netWorthHistory,
    cashFlow: {
      income: income ? parseFloat(income.total) : 0,
      expenses: expenses ? Math.abs(parseFloat(expenses.total)) : 0,
    },
    weekly: {
      week_start: weekly.week_start,
      remaining: parseFloat(weekly.remaining),
      spent: parseFloat(weekly.spent),
    },
    monthlyBills: {
      nextMonthly: parseFloat(nextMonthly.rows[0].next_monthly),
      monthlyAverage: parseFloat(monthlyAvg.rows[0].monthly_average),
    },
    subscriptions: {
      perYear: parseFloat(subs.rows[0].per_year),
      perMonth: parseFloat(subs.rows[0].per_month),
    },
    auto: { ytd: parseFloat(auto.rows[0].ytd) },
  })
}
