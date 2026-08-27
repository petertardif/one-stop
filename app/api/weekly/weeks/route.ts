import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { resolveTimeZone } from '@/lib/timezone'
import { COUNTS_TOWARD_WEEKLY, weekStartExpr } from '@/lib/weeklyBudget'

// How many upcoming weeks are always offered, even with no data yet, so a week can be
// topped up or planned before anything lands in it.
const FUTURE_WEEKS = 4

// "Today" in the caller's timezone as YYYY-MM-DD, then the Friday that starts its week.
function currentWeekStart(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const d = new Date(`${parts}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 2) % 7))
  return d.toISOString().slice(0, 10)
}

function addWeeks(weekStart: string, n: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n * 7)
  return d.toISOString().slice(0, 10)
}

// GET /api/weekly/weeks?tz=IANA — every Fri->Thu week the 1k Weekly view can show:
// weeks with counting spend or a top-up, plus the current week and the next 4 (always,
// so future weeks are reachable before they have data). Newest first.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tz = resolveTimeZone(new URL(req.url).searchParams.get('tz'))

  const result = await query<{ week_start: string }>(
    `SELECT to_char(w.week_start, 'YYYY-MM-DD') AS week_start
     FROM (
       SELECT DISTINCT ${weekStartExpr('t.date')} AS week_start
       FROM transactions t
       WHERE t.user_id = $1 AND ${COUNTS_TOWARD_WEEKLY}
       UNION
       SELECT DISTINCT week_start
       FROM weekly_budget_adjustments
       WHERE user_id = $1
     ) w
     ORDER BY w.week_start DESC`,
    [session.user.id]
  )

  const current = currentWeekStart(tz)
  const upcoming = Array.from({ length: FUTURE_WEEKS + 1 }, (_, i) => addWeeks(current, i))
  const weeks = Array.from(new Set([...upcoming, ...result.rows.map((r) => r.week_start)]))
    .sort((a, b) => b.localeCompare(a))

  return NextResponse.json({ weeks, current })
}
