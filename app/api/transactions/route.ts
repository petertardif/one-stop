import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const createSchema = z.object({
  account_id: z.string().uuid().nullable().optional(),
  amount: z.number(),
  type: z.enum(['income', 'expense']),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  check_number: z.string().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_posted: z.boolean().optional(),
  budget_flagged: z.boolean().optional(),
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

  const conditions: string[] = ['t.user_id = $1']
  const params: unknown[] = [session.user.id]
  let paramIdx = 2

  if (accountId) {
    conditions.push(`t.account_id = $${paramIdx++}`)
    params.push(accountId)
  }

  if (period && period !== 'all') {
    if (/^\d{4}-\d{2}$/.test(period)) {
      // Individual month: YYYY-MM
      conditions.push(`to_char(t.date, 'YYYY-MM') = $${paramIdx++}`)
      params.push(period)
    } else if (/^\d{4}$/.test(period)) {
      // Individual year: YYYY
      conditions.push(`date_part('year', t.date) = $${paramIdx++}`)
      params.push(parseInt(period, 10))
    } else if (period === '3m') {
      conditions.push(`t.date >= (CURRENT_DATE - INTERVAL '3 months')`)
    } else if (period === '6m') {
      conditions.push(`t.date >= (CURRENT_DATE - INTERVAL '6 months')`)
    }
  }

  const where = conditions.join(' AND ')

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
    notes: string | null
    created_at: string
    updated_at: string
  }>(
    `SELECT t.id, t.account_id, a.name AS account_name, t.plaid_transaction_id,
            t.is_manual, t.amount, t.type, t.category, t.description, t.check_number,
            t.date, t.is_posted, t.budget_flagged, t.notes, t.created_at, t.updated_at
     FROM transactions t
     LEFT JOIN accounts a ON a.id = t.account_id
     WHERE ${where}
     ORDER BY t.date DESC, t.created_at DESC`,
    params
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
    `INSERT INTO transactions
       (user_id, account_id, is_manual, amount, type, category, description,
        check_number, date, is_posted, budget_flagged, notes)
     VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      session.user.id,
      d.account_id ?? null,
      d.amount,
      d.type,
      d.category ?? null,
      d.description ?? null,
      d.check_number ?? null,
      d.date,
      d.is_posted ?? true,
      d.budget_flagged ?? false,
      d.notes ?? null,
    ]
  )

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 })
}
