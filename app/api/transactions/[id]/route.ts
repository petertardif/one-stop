import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const updateSchema = z.object({
  account_id: z.string().uuid().nullable().optional(),
  amount: z.number().optional(),
  type: z.enum(['income', 'expense']).optional(),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  check_number: z.string().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  is_posted: z.boolean().optional(),
  budget_flagged: z.boolean().optional(),
  notes: z.string().nullable().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data
  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1

  const fieldMap: Record<string, unknown> = {
    account_id: d.account_id,
    amount: d.amount,
    type: d.type,
    category: d.category,
    description: d.description,
    check_number: d.check_number,
    date: d.date,
    is_posted: d.is_posted,
    budget_flagged: d.budget_flagged,
    notes: d.notes,
  }

  for (const [col, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      fields.push(`${col} = $${idx++}`)
      values.push(val)
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  fields.push(`updated_at = NOW()`)
  values.push(params.id, session.user.id)

  const result = await query(
    `UPDATE transactions
     SET ${fields.join(', ')}
     WHERE id = $${idx++} AND user_id = $${idx}
     RETURNING id`,
    values
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only manual transactions can be deleted
  const result = await query(
    `DELETE FROM transactions
     WHERE id = $1 AND user_id = $2 AND is_manual = true
     RETURNING id`,
    [params.id, session.user.id]
  )

  if (result.rowCount === 0) {
    return NextResponse.json(
      { error: 'Not found or transaction is not manually created' },
      { status: 404 }
    )
  }

  return NextResponse.json({ success: true })
}
