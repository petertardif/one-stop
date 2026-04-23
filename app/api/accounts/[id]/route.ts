import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const ACCOUNT_TYPES = [
  'checking', 'savings', 'investment', 'brokerage', 'retirement',
  'real_estate', 'credit_card', 'mortgage', 'car_loan', 'student_loan', 'other_debt',
] as const

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  institution: z.string().nullable().optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  balance: z.number().optional(),
  interest_rate: z.number().nullable().optional(),
  minimum_payment: z.number().nullable().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await query(
    `SELECT id, name, institution, type, balance, currency, plaid_account_id, last_synced_at,
            interest_rate, minimum_payment, created_at, updated_at
     FROM accounts WHERE id = $1 AND user_id = $2`,
    [params.id, session.user.id]
  )

  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(result.rows[0])
}

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
    name: d.name,
    institution: d.institution,
    type: d.type,
    balance: d.balance,
    interest_rate: d.interest_rate,
    minimum_payment: d.minimum_payment,
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
    `UPDATE accounts SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING id`,
    values
  )

  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
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

  const result = await query(
    `DELETE FROM accounts WHERE id = $1 AND user_id = $2 RETURNING id`,
    [params.id, session.user.id]
  )

  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
