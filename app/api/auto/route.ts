import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  car: z.string().min(1),
  description: z.string().nullable().optional(),
  cost: z.number().nonnegative(),
  performed_by: z.string().nullable().optional(),
})

// GET /api/auto — the user's full vehicle service log in manual (sort_order)
// order, newest date first as a tiebreak. Car/year filters are applied client-side.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await query(
    `SELECT id, date, car, description, cost, performed_by, sort_order, created_at, updated_at
     FROM auto_services
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
    `INSERT INTO auto_services (user_id, date, car, description, cost, performed_by, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM auto_services WHERE user_id = $1))
     RETURNING id`,
    [session.user.id, d.date, d.car, d.description ?? null, d.cost, d.performed_by ?? null]
  )

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 })
}
