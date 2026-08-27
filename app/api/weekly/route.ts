import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { resolveTimeZone } from '@/lib/timezone'
import {
  COUNTS_TOWARD_WEEKLY, WEEKLY_BUDGET, getWeeklyBudget, weekStartExpr,
} from '@/lib/weeklyBudget'

// GET /api/weekly?week_start=YYYY-MM-DD&tz=IANA — everything consuming one Fri->Thu
// week's $1,000 allowance: the counting transactions (MONTHLY BILLS excluded) and the
// week's top-ups, plus the week's allowance / remaining / spent figures.
//
// `week_start` is normalized to the week's Friday rather than trusted, so an arbitrary
// mid-week date can't silently produce an off-week window.
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

  // Resolve the window first: the requested week snapped to its Friday, or the current
  // week when none was given. Everything below keys off this single date.
  const wk = await query<{ week_start: string }>(
    `WITH today AS (SELECT (now() AT TIME ZONE $2::text)::date AS d)
     SELECT to_char(
              COALESCE(${weekStartExpr('$1::date')}, ${weekStartExpr('(SELECT d FROM today)')}),
              'YYYY-MM-DD'
            ) AS week_start`,
    [weekParam, tz]
  )
  const weekStart = wk.rows[0].week_start

  const transactions = await query(
    `WITH adj AS (
       SELECT week_start, SUM(amount) AS total
       FROM weekly_budget_adjustments
       WHERE user_id = $1
       GROUP BY week_start
     ),
     ledger AS (
       -- Same running-balance window as the ledger: computed over the FULL history so
       -- narrowing to one week below never recomputes (and never distorts) it.
       SELECT t.id, t.is_manual, t.amount, t.type, t.category, t.description,
              t.date, t.is_posted, t.budget_flagged, t.budget_account, t.seq, t.notes,
              t.created_at,
              ${WEEKLY_BUDGET} + COALESCE(a.total, 0)
                   + SUM(CASE WHEN ${COUNTS_TOWARD_WEEKLY} THEN t.amount ELSE 0 END) OVER (
                PARTITION BY ${weekStartExpr('t.date')}
                ORDER BY t.seq NULLS FIRST, t.date, t.created_at
                ROWS UNBOUNDED PRECEDING
              ) AS weekly_balance,
              ${COUNTS_TOWARD_WEEKLY} AS counts_toward_weekly
       FROM transactions t
       LEFT JOIN adj a
         ON a.week_start = ${weekStartExpr('t.date')}
       WHERE t.user_id = $1
     )
     SELECT l.id, l.is_manual, l.amount, l.type, l.category, l.description,
            l.date, l.is_posted, l.budget_account, l.seq, l.notes, l.weekly_balance
     FROM ledger l
     WHERE l.counts_toward_weekly
       AND l.date >= $2::date
       AND l.date < $2::date + 7
     ORDER BY l.seq DESC NULLS LAST, l.date DESC, l.created_at DESC`,
    [session.user.id, weekStart]
  )

  const adjustments = await query(
    `SELECT id, to_char(week_start, 'YYYY-MM-DD') AS week_start, amount, created_at
     FROM weekly_budget_adjustments
     WHERE user_id = $1 AND week_start = $2::date
     ORDER BY created_at ASC`,
    [session.user.id, weekStart]
  )

  // remaining/spent come from the one shared helper rather than being recomputed here.
  const budget = await getWeeklyBudget(session.user.id, weekStart, tz)
  const topUps = adjustments.rows.reduce((sum, a) => sum + Number(a.amount), 0)

  return NextResponse.json({
    week_start: weekStart,
    allowance: WEEKLY_BUDGET + topUps,
    remaining: budget.remaining,
    spent: budget.spent,
    transactions: transactions.rows,
    adjustments: adjustments.rows,
  })
}
