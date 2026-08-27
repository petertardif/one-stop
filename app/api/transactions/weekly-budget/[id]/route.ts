import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

// Same shape the POST accepts — a top-up is only ever an amount against a week.
const updateSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().refine((n) => n !== 0, 'Amount must be non-zero'),
})

// PUT /api/transactions/weekly-budget/[id] — correct a 1K allowance top-up (amount, or
// which week it applies to). Top-ups affect only the weekly allowance, never a ledger
// row or the checkbook balance, so there is nothing to re-shift.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = updateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { week_start, amount } = parsed.data

  const result = await query(
    `UPDATE weekly_budget_adjustments
     SET week_start = $3, amount = $4, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [params.id, session.user.id, week_start, amount]
  )
  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
