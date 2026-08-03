import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { resolveTimeZone } from '@/lib/timezone'

const createSchema = z.object({
  account_id: z.string().uuid().nullable().optional(),
  amount: z.number(),
  type: z.enum(['income', 'expense']),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  check_number: z.string().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_posted: z.boolean().optional(),
  // Which account this budget transaction is on; null = N/A (not in the budget).
  // The server derives budget_flagged = (budget_account IS NOT NULL).
  budget_account: z.enum(['bank', 'chase_cc', 'boa_cc']).nullable().optional(),
  notes: z.string().nullable().optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('account_id')
  const period = searchParams.get('period') // 'all' | 'YYYY' | '3m' | '6m' | 'YYYY-MM'
  // Repeated `category` params (?category=GAS&category=HOUSE) = multi-select from the
  // Category column header. Absent, or the legacy single 'all', means every category.
  const categories = searchParams.getAll('category').filter((c) => c && c !== 'all')
  // 'all' | 'posted' | 'unposted' -- the Posted column header filter.
  const postedParam = searchParams.get('posted')
  const posted = postedParam === 'posted' || postedParam === 'unposted' ? postedParam : 'all'
  const tz = resolveTimeZone(searchParams.get('tz'))

  // Server-side pagination (newest-first). pageSize is restricted to the dropdown
  // choices; page is 1-based. The window functions still run over the full ledger,
  // so the running balance + weekly balance stay correct on every page.
  const ALLOWED_SIZES = [100, 300, 500, 1000]
  const pageSizeRaw = parseInt(searchParams.get('pageSize') ?? '', 10)
  const pageSize = ALLOWED_SIZES.includes(pageSizeRaw) ? pageSizeRaw : 100
  const pageRaw = parseInt(searchParams.get('page') ?? '', 10)
  const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw

  // Filters apply to the OUTER query (alias `l`) so the weekly-balance window
  // function inside the CTE always runs over the user's full ledger, keeping each
  // Fri–Thu week complete even when the view is filtered to a month/account.
  const conditions: string[] = []
  const params: unknown[] = [session.user.id]
  let paramIdx = 2

  if (accountId) {
    conditions.push(`l.account_id = $${paramIdx++}`)
    params.push(accountId)
  }

  if (categories.length > 0) {
    conditions.push(`l.category = ANY($${paramIdx++})`)
    params.push(categories)
  }

  if (posted !== 'all') {
    conditions.push(`l.is_posted = $${paramIdx++}`)
    params.push(posted === 'posted')
  }

  if (period && period !== 'all') {
    if (/^\d{4}-\d{2}$/.test(period)) {
      // Individual month: YYYY-MM
      conditions.push(`to_char(l.date, 'YYYY-MM') = $${paramIdx++}`)
      params.push(period)
    } else if (/^\d{4}$/.test(period)) {
      // Individual year: YYYY
      conditions.push(`date_part('year', l.date) = $${paramIdx++}`)
      params.push(parseInt(period, 10))
    } else if (period === '3m' || period === '6m') {
      // "N months ago" from today in the user's timezone (not the DB's UTC).
      const months = period === '3m' ? 3 : 6
      conditions.push(`l.date >= ((now() AT TIME ZONE $${paramIdx}::text)::date - INTERVAL '${months} months')`)
      params.push(tz)
      paramIdx++
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const result = await query<{
    id: string
    account_id: string | null
    account_name: string | null
    plaid_transaction_id: string | null
    is_manual: boolean
    amount: string
    type: string
    category: string | null
    description: string | null
    check_number: string | null
    date: string
    is_posted: boolean
    budget_flagged: boolean
    budget_account: string | null
    balance: string | null
    seq: string | null
    weekly_balance: string | null
    notes: string | null
    created_at: string
    updated_at: string
    total_count: string
  }>(
    `WITH adj AS (
       SELECT week_start, SUM(amount) AS total
       FROM weekly_budget_adjustments
       WHERE user_id = $1
       GROUP BY week_start
     ),
     ledger AS (
       SELECT t.id, t.account_id, t.plaid_transaction_id, t.is_manual, t.amount,
              t.type, t.category, t.description, t.check_number, t.date, t.is_posted,
              t.budget_flagged, t.budget_account, t.balance, t.seq, t.notes, t.created_at, t.updated_at,
              1000 + COALESCE(a.total, 0)
                   + SUM(CASE WHEN t.budget_flagged THEN t.amount ELSE 0 END) OVER (
                PARTITION BY (t.date - ((EXTRACT(DOW FROM t.date)::int + 2) % 7))
                ORDER BY t.seq NULLS FIRST, t.date, t.created_at
                ROWS UNBOUNDED PRECEDING
              ) AS weekly_balance
       FROM transactions t
       LEFT JOIN adj a
         ON a.week_start = (t.date - ((EXTRACT(DOW FROM t.date)::int + 2) % 7))
       WHERE t.user_id = $1
     )
     SELECT l.id, l.account_id, a.name AS account_name, l.plaid_transaction_id,
            l.is_manual, l.amount, l.type, l.category, l.description, l.check_number,
            l.date, l.is_posted, l.budget_flagged, l.budget_account, l.balance, l.seq, l.weekly_balance,
            l.notes, l.created_at, l.updated_at,
            COUNT(*) OVER() AS total_count
     FROM ledger l
     LEFT JOIN accounts a ON a.id = l.account_id
     ${where}
     ORDER BY l.seq DESC NULLS LAST, l.date DESC, l.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, pageSize, (page - 1) * pageSize]
  )

  const total = result.rows.length ? Number(result.rows[0].total_count) : 0
  return NextResponse.json({ rows: result.rows, total, page, pageSize })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data

  // Append to the checkbook ledger: new entry takes the next seq and extends the
  // running balance (latest balance + this signed amount).
  const latest = await query<{ seq: string | null; balance: string | null }>(
    `SELECT seq, balance FROM transactions
     WHERE user_id = $1
     ORDER BY seq DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [session.user.id]
  )
  const prevSeq = latest.rows[0]?.seq != null ? Number(latest.rows[0].seq) : 0
  const prevBalance = latest.rows[0]?.balance != null ? Number(latest.rows[0].balance) : 0
  const newSeq = prevSeq + 1
  const newBalance = Math.round((prevBalance + d.amount) * 100) / 100

  const budgetAccount = d.budget_account ?? null

  const result = await query<{ id: string }>(
    `INSERT INTO transactions
       (user_id, account_id, is_manual, seq, amount, type, category, description,
        check_number, date, is_posted, budget_flagged, budget_account, balance, notes)
     VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [
      session.user.id,
      d.account_id ?? null,
      newSeq,
      d.amount,
      d.type,
      d.category ?? null,
      d.description ?? null,
      d.check_number ?? null,
      d.date,
      d.is_posted ?? true,
      budgetAccount !== null,
      budgetAccount,
      newBalance,
      d.notes ?? null,
    ]
  )

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 })
}
