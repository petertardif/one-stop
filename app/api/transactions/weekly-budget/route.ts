import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { resolveTimeZone } from '@/lib/timezone'
import { getWeeklyBudget } from '@/lib/weeklyBudget'

// A Friday→Thursday week's $1,000 allowance (see lib/weeklyBudget). Defaults to
// the current week; an optional `week_start` (a Friday) selects a different week.
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

  const row = await getWeeklyBudget(session.user.id, weekParam, tz)
  return NextResponse.json(row)
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
