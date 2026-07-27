import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  organization: z.string().nullable().optional(),
  donor_name: z.string().nullable().optional(),
  donor_contact: z.string().nullable().optional(),
  amount: z.number().nonnegative(),
  payment_method: z.enum(['cash', 'non_cash']),
  goods_services_value: z.number().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = updateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const d = parsed.data

  const result = await query(
    `UPDATE charitable_donations
     SET date = $3, organization = $4, donor_name = $5, donor_contact = $6,
         amount = $7, payment_method = $8, goods_services_value = $9, notes = $10,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [
      params.id, session.user.id, d.date, d.organization ?? null, d.donor_name ?? null,
      d.donor_contact ?? null, d.amount, d.payment_method,
      d.goods_services_value ?? null, d.notes ?? null,
    ]
  )
  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await query(
    `DELETE FROM charitable_donations WHERE id = $1 AND user_id = $2 RETURNING id`,
    [params.id, session.user.id]
  )
  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
