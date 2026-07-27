import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { resolveTimeZone } from '@/lib/timezone'

const WEEKLY_BUDGET = 1000

// A Friday→Thursday week's $1,000 allowance. Only budget-flagged transactions
// in the window count. Defaults to the current week (independent of the ledger's
// period filter); an optional `week_start` (a Friday) selects a different week.
// Amounts are signed (expenses negative):
//   remaining = 1000 + week top-ups + SUM(amount)
//   spent     = ABS(SUM(amount))  — the magnitude spent against the 1k that week
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const weekParam = params.get('week_start')
  if (weekParam && !/^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    return NextResponse.json({ error: 'Invalid week_start' }, { status: 400 })
  }
  const tz = resolveTimeZone(params.get('tz'))

  const result = await query<{ week_start: string; remaining: string; spent: string }>(
    `WITH today AS (
       -- "Today" in the user's local timezone (passed from the browser), not
       -- the DB's UTC, so the Fri→Thu week doesn't roll over a day early at night.
       SELECT (now() AT TIME ZONE $3::text)::date AS d
     ),
     wk AS (
       SELECT COALESCE(
                $2::date,
                ((SELECT d FROM today) - ((EXTRACT(DOW FROM (SELECT d FROM today))::int + 2) % 7))
              ) AS start
     ),
     adj AS (
       SELECT COALESCE(SUM(amount), 0) AS total
       FROM weekly_budget_adjustments
       WHERE user_id = $1 AND week_start = (SELECT start FROM wk)
     ),
     flagged AS (
       -- net_all: every budget account (powers remaining -- all 3 accounts).
       -- net_chase: Chase CC only (powers spent -- the 1k Budget Spent card).
       SELECT
         COALESCE(SUM(t.amount) FILTER (WHERE t.budget_flagged), 0) AS net_all,
         COALESCE(SUM(t.amount) FILTER (WHERE t.budget_account = 'chase_cc'), 0) AS net_chase
       FROM wk
       LEFT JOIN transactions t
         ON t.user_id = $1
        AND t.date >= wk.start
        AND t.date < wk.start + 7
     )
     SELECT to_char((SELECT start FROM wk), 'YYYY-MM-DD') AS week_start,
            ${WEEKLY_BUDGET} + (SELECT total FROM adj) + (SELECT net_all FROM flagged) AS remaining,
            ABS((SELECT net_chase FROM flagged)) AS spent`,
    [session.user.id, weekParam, tz]
  )

  return NextResponse.json(result.rows[0])
}

const createSchema = z.object({
  // Friday that starts the Fri→Thu week the top-up applies to.
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Positive raises the week's allowance; negative reduces it.
  amount: z.number().refine((n) => n !== 0, 'Amount must be non-zero'),
})

// POST — add a top-up to a chosen week's 1K allowance. Affects only the weekly
// balance, never the checkbook `balance` column, and creates no ledger row.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { week_start, amount } = parsed.data

  const result = await query<{ id: string }>(
    `INSERT INTO weekly_budget_adjustments (user_id, week_start, amount)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [session.user.id, week_start, amount]
  )

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 })
}
