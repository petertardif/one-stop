import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const ASSET_TYPES = ['checking', 'savings', 'investment', 'brokerage', 'retirement', 'real_estate']
const DEBT_TYPES = ['credit_card', 'mortgage', 'car_loan', 'student_loan', 'other_debt']

interface AccountRow {
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

interface CashFlowRow {
  type: string
  total: string
}

interface SnapshotRow {
  snapshot_date: string
  net_worth: string
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id

  const [accountsResult, cashFlowResult, historyResult] = await Promise.all([
    query<AccountRow>(
      `SELECT id, name, institution, type, balance, currency, plaid_account_id, last_synced_at,
              interest_rate, minimum_payment
       FROM accounts
       WHERE user_id = $1
       ORDER BY type, name`,
      [userId]
    ),
    query<CashFlowRow>(
      `SELECT type, SUM(amount) AS total
       FROM transactions
       WHERE user_id = $1
         AND date >= date_trunc('month', CURRENT_DATE)
         AND date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
       GROUP BY type`,
      [userId]
    ),
    query<SnapshotRow>(
      `SELECT TO_CHAR(snapshot_date, 'YYYY-MM-DD') AS snapshot_date, net_worth
       FROM net_worth_snapshots
       WHERE user_id = $1
         AND snapshot_date >= CURRENT_DATE - INTERVAL '12 months'
       ORDER BY snapshot_date ASC`,
      [userId]
    ),
  ])

  const accounts = accountsResult.rows
  const cashFlowRows = cashFlowResult.rows

  const assets = accounts
    .filter((a) => ASSET_TYPES.includes(a.type))
    .reduce((sum, a) => sum + parseFloat(a.balance), 0)

  const liabilities = accounts
    .filter((a) => DEBT_TYPES.includes(a.type))
    .reduce((sum, a) => sum + Math.abs(parseFloat(a.balance)), 0)

  const netWorthValue = assets - liabilities

  // Upsert today's snapshot
  await query(
    `INSERT INTO net_worth_snapshots (user_id, snapshot_date, net_worth, assets, liabilities)
     VALUES ($1, CURRENT_DATE, $2, $3, $4)
     ON CONFLICT (user_id, snapshot_date) DO UPDATE
       SET net_worth = EXCLUDED.net_worth,
           assets = EXCLUDED.assets,
           liabilities = EXCLUDED.liabilities,
           updated_at = NOW()`,
    [userId, netWorthValue, assets, liabilities]
  )

  const accountsByType: Record<string, AccountRow[]> = {}
  for (const acct of accounts) {
    const group = displayGroup(acct.type)
    if (!accountsByType[group]) accountsByType[group] = []
    accountsByType[group].push(acct)
  }

  const income = cashFlowRows.find((r) => r.type === 'income')
  const expenses = cashFlowRows.find((r) => r.type === 'expense')

  const debts = accounts
    .filter((a) => DEBT_TYPES.includes(a.type))
    .sort((a, b) => Math.abs(parseFloat(b.balance)) - Math.abs(parseFloat(a.balance)))

  // Merge today's snapshot into history if not already there
  const history = historyResult.rows
  const todayStr = new Date().toISOString().slice(0, 10)
  if (!history.find((r) => r.snapshot_date === todayStr)) {
    history.push({ snapshot_date: todayStr, net_worth: String(netWorthValue) })
  }

  return NextResponse.json({
    netWorth: { assets, liabilities, netWorth: netWorthValue },
    accountsByType,
    cashFlow: {
      income: income ? parseFloat(income.total) : 0,
      expenses: expenses ? Math.abs(parseFloat(expenses.total)) : 0,
    },
    debts,
    netWorthHistory: history.map((r) => ({
      date: r.snapshot_date,
      netWorth: parseFloat(r.net_worth),
    })),
  })
}

function displayGroup(type: string): string {
  if (type === 'checking' || type === 'savings') return 'Checking & Savings'
  if (type === 'investment' || type === 'brokerage' || type === 'retirement') return 'Investments'
  if (type === 'real_estate') return 'Real Estate'
  return 'Debt'
}
