import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

// Mass "Mark as…" update from the ledger toolbar. One field at a time across the
// selected manual rows. Neither `is_posted` nor `budget_account` affects the
// running checkbook `balance`, so no re-shift is needed — a single UPDATE.
const schema = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('is_posted'),
    ids: z.array(z.string().uuid()).min(1),
    value: z.boolean(),
  }),
  z.object({
    field: z.literal('budget_account'),
    ids: z.array(z.string().uuid()).min(1),
    value: z.enum(['bank', 'chase_cc', 'boa_cc']).nullable(),
  }),
])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { field, ids, value } = parsed.data

  // Only manual rows are updatable (Plaid rows stay protected), matching bulk delete.
  let result
  if (field === 'is_posted') {
    result = await query(
      `UPDATE transactions SET is_posted = $1, updated_at = now()
       WHERE user_id = $2 AND is_manual = true AND id = ANY($3::uuid[])`,
      [value, session.user.id, ids]
    )
  } else {
    // budget_flagged stays in sync (= budget_account IS NOT NULL).
    result = await query(
      `UPDATE transactions
       SET budget_account = $1, budget_flagged = ($1 IS NOT NULL), updated_at = now()
       WHERE user_id = $2 AND is_manual = true AND id = ANY($3::uuid[])`,
      [value, session.user.id, ids]
    )
  }

  return NextResponse.json({ updated: result.rowCount ?? 0 })
}
