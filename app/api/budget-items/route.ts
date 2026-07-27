import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const createSchema = z.object({
  description: z.string().min(1),
  due_date: z.string().nullable().optional(),
  pay_type: z.enum(['autopay', 'manual']),
  duration: z.enum(['annual', 'monthly', 'biweekly', 'weekly']),
  amount: z.number(),
  category: z.string().nullable().optional(),
})

// GET /api/budget-items?archived=true|false
// Returns the user's budget items plus `monthly_average`: the single trailing
// 12-month figure = net MONTHLY BILLS spend from the ledger ÷ 12. Amounts are
// signed (expenses negative), so net spend = -SUM(amount).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const archived = new URL(req.url).searchParams.get('archived') === 'true'

  const items = await query(
    `SELECT id, description, due_date, pay_type, duration, amount, category,
            archived_at, sort_order, created_at, updated_at
     FROM budget_items
     WHERE user_id = $1 AND archived_at IS ${archived ? 'NOT NULL' : 'NULL'}
     ORDER BY sort_order NULLS LAST, created_at`,
    [session.user.id]
  )

  const avg = await query<{ monthly_average: string }>(
    `SELECT COALESCE(-SUM(amount), 0) / 12 AS monthly_average
     FROM transactions
     WHERE user_id = $1
       AND category = 'MONTHLY BILLS'
       AND date >= (CURRENT_DATE - INTERVAL '12 months')`,
    [session.user.id]
  )

  // Distinct categories already in use (across active + archived) so free-form
  // entries persist in the dropdown regardless of the current view.
  const cats = await query<{ category: string }>(
    `SELECT DISTINCT category FROM budget_items
     WHERE user_id = $1 AND category IS NOT NULL ORDER BY category`,
    [session.user.id]
  )

  return NextResponse.json({
    items: items.rows,
    monthly_average: avg.rows[0].monthly_average,
    categories: cats.rows.map((r) => r.category),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data
  const result = await query<{ id: string }>(
    `INSERT INTO budget_items (user_id, description, due_date, pay_type, duration, amount, category, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM budget_items WHERE user_id = $1))
     RETURNING id`,
    [session.user.id, d.description, d.due_date ?? null, d.pay_type, d.duration, d.amount, d.category ?? null]
  )

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 })
}
