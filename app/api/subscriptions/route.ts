import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const createSchema = z.object({
  category: z.string().nullable().optional(),
  service: z.string().min(1),
  company: z.string().nullable().optional(),
  price_per_year: z.number().nullable().optional(),
  price_per_month: z.number().nullable().optional(),
  renewal_cycle: z.enum(['monthly', 'annual']),
  renewal_day: z.number().int().min(1).max(31).nullable().optional(),
  renewal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

// GET /api/subscriptions?tab=active|cancelled
// active    → cancelled_at IS NULL, newest first.
// cancelled → cancelled_at IS NOT NULL, newest cancelled first.
// Also returns distinct categories so free-form entries persist in the dropdown.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cancelled = new URL(req.url).searchParams.get('tab') === 'cancelled'

  const rows = await query(
    `SELECT id, category, service, company, price_per_year, price_per_month,
            renewal_cycle, renewal_day, renewal_date, cancelled_at, sort_order, created_at, updated_at
     FROM subscriptions
     WHERE user_id = $1 AND cancelled_at IS ${cancelled ? 'NOT NULL' : 'NULL'}
     ORDER BY ${cancelled ? 'cancelled_at DESC' : 'sort_order NULLS LAST, created_at ASC'}`,
    [session.user.id]
  )

  const cats = await query<{ category: string }>(
    `SELECT DISTINCT category FROM subscriptions
     WHERE user_id = $1 AND category IS NOT NULL ORDER BY category`,
    [session.user.id]
  )

  return NextResponse.json({ rows: rows.rows, categories: cats.rows.map((r) => r.category) })
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
    `INSERT INTO subscriptions
       (user_id, category, service, company, price_per_year, price_per_month,
        renewal_cycle, renewal_day, renewal_date, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM subscriptions WHERE user_id = $1))
     RETURNING id`,
    [
      session.user.id,
      d.category ?? null,
      d.service,
      d.company ?? null,
      d.price_per_year ?? null,
      d.price_per_month ?? null,
      d.renewal_cycle,
      d.renewal_cycle === 'monthly' ? d.renewal_day ?? null : null,
      d.renewal_cycle === 'annual' ? d.renewal_date ?? null : null,
    ]
  )

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 })
}
