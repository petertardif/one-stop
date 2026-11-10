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

  const [invSnaps, debtSnaps, debtTermSnaps, cashFlow, monthlyAvg, nextMonthly, subs, auto, weekly] = await Promise.all([
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
    // Every debt that is active or was paid off this year, with its term and
    // snapshots — feeds the Short Term / Long Term tiles. paid_at is rendered
    // as a date in the caller's timezone.
    query<{ id: string; term: 'short' | 'long'; paid_on: string | null; as_of: string | null; balance: string | null }>(
      `SELECT d.id, d.term, to_char(d.paid_at AT TIME ZONE $2, 'YYYY-MM-DD') AS paid_on,
              to_char(s.as_of, 'YYYY-MM-DD') AS as_of, s.balance
       FROM debt_accounts d
       LEFT JOIN debt_snapshots s ON s.debt_account_id = d.id
       WHERE d.user_id = $1
         AND (d.paid_at IS NULL OR d.paid_at AT TIME ZONE $2 >= date_trunc('year', NOW() AT TIME ZONE $2))
       ORDER BY d.id, s.as_of`,
      [userId, tz]
    ),
    // This month's cash flow. Income = only transactions categorized INCOME (so
    // returns, transfers in, etc. don't inflate it); expenses = every expense.
    query<{ income: string; expenses: string }>(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE UPPER(TRIM(category)) = 'INCOME'), 0) AS income,
              COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS expenses
       FROM transactions
       WHERE user_id = $1
         AND date >= date_trunc('month', CURRENT_DATE)
         AND date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`,
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

  // Short/Long Term tiles. Remaining = active debts' balance today. Paid down
  // this year = every drop in balance during the calendar year: from the last
  // balance before Jan 1 (if any) through each snapshot this year, and — for a
  // debt marked paid off this year — down to $0 on its paid date. Increases
  // (new charges) are ignored rather than netted against payments.
  const yearStart = today.slice(0, 4) + '-01-01'
  const debtsById = new Map<string, { term: 'short' | 'long'; paidOn: string | null; snaps: SnapPoint[] }>()
  for (const r of debtTermSnaps.rows) {
    const d = debtsById.get(r.id) ?? { term: r.term, paidOn: r.paid_on, snaps: [] }
    if (r.as_of && r.balance != null) d.snaps.push({ as_of: r.as_of, amount: parseFloat(r.balance) })
    debtsById.set(r.id, d)
  }
  const debtTerms = {
    short: { remaining: 0, paidThisYear: 0 },
    long: { remaining: 0, paidThisYear: 0 },
  }
  for (const d of Array.from(debtsById.values())) {
    const t = debtTerms[d.term]
    if (!d.paidOn) t.remaining += valueOnOrBefore<SnapPoint>(d.snaps, today, (x) => x.amount) ?? 0
    const before = d.snaps.filter((x) => x.as_of < yearStart)
    const path = [
      ...(before.length ? [before[before.length - 1].amount] : []),
      ...d.snaps.filter((x) => x.as_of >= yearStart).map((x) => x.amount),
      ...(d.paidOn ? [0] : []),
    ]
    for (let i = 1; i < path.length; i++) t.paidThisYear += Math.max(0, path[i - 1] - path[i])
  }


  return NextResponse.json({
    netWorth: { assets, liabilities, netWorth: assets - liabilities },
    netWorthHistory,
    cashFlow: {
      income: parseFloat(cashFlow.rows[0].income),
      expenses: Math.abs(parseFloat(cashFlow.rows[0].expenses)),
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
    debtTerms,
  })
}
