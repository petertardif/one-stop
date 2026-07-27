import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  organization: z.string().nullable().optional(),
  donor_name: z.string().nullable().optional(),
  donor_contact: z.string().nullable().optional(),
  amount: z.number().nonnegative(),
  payment_method: z.enum(['cash', 'non_cash']),
  goods_services_value: z.number().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
})

const COLS = `id, date, organization, donor_name, donor_contact, amount,
  payment_method, goods_services_value, notes, sort_order, created_at, updated_at`

// GET /api/charitable-donations — the user's full donation log in manual
// (sort_order) order, newest date first as a tiebreak. Year filter is client-side.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await query(
    `SELECT ${COLS}
     FROM charitable_donations
     WHERE user_id = $1
     ORDER BY sort_order NULLS LAST, date DESC`,
    [session.user.id]
  )

  return NextResponse.json({ rows: rows.rows })
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
    `INSERT INTO charitable_donations
       (user_id, date, organization, donor_name, donor_contact, amount,
        payment_method, goods_services_value, notes, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM charitable_donations WHERE user_id = $1))
     RETURNING id`,
    [
      session.user.id, d.date, d.organization ?? null, d.donor_name ?? null,
      d.donor_contact ?? null, d.amount, d.payment_method,
      d.goods_services_value ?? null, d.notes ?? null,
    ]
  )

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 })
}
