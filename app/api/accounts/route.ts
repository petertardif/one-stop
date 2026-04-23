import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const ACCOUNT_TYPES = [
  'checking', 'savings', 'investment', 'brokerage', 'retirement',
  'real_estate', 'credit_card', 'mortgage', 'car_loan', 'student_loan', 'other_debt',
] as const

const createSchema = z.object({
  name: z.string().min(1),
  institution: z.string().nullable().optional(),
  type: z.enum(ACCOUNT_TYPES),
  balance: z.number().default(0),
  currency: z.string().default('USD'),
  interest_rate: z.number().nullable().optional(),
  minimum_payment: z.number().nullable().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await query(
    `SELECT id, name, institution, type, balance, currency, plaid_account_id, last_synced_at,
            interest_rate, minimum_payment, created_at, updated_at
     FROM accounts WHERE user_id = $1 ORDER BY type, name`,
    [session.user.id]
  )

  return NextResponse.json(result.rows)
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
  const result = await query<{ id: string }>(
    `INSERT INTO accounts (user_id, name, institution, type, balance, currency, interest_rate, minimum_payment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [session.user.id, d.name, d.institution ?? null, d.type, d.balance, d.currency,
     d.interest_rate ?? null, d.minimum_payment ?? null]
  )

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 })
}
