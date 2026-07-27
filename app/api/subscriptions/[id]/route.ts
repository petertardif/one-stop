import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const updateSchema = z.object({
  category: z.string().nullable().optional(),
  service: z.string().min(1).optional(),
  company: z.string().nullable().optional(),
  price_per_year: z.number().nullable().optional(),
  price_per_month: z.number().nullable().optional(),
  renewal_cycle: z.enum(['monthly', 'annual']).optional(),
  renewal_day: z.number().int().min(1).max(31).nullable().optional(),
  renewal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
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

  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1
  const fieldMap: Record<string, unknown> = {
    category: d.category,
    service: d.service,
    company: d.company,
    price_per_year: d.price_per_year,
    price_per_month: d.price_per_month,
    renewal_cycle: d.renewal_cycle,
    renewal_day: d.renewal_day,
    renewal_date: d.renewal_date,
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
  fields.push('updated_at = NOW()')
  values.push(params.id, session.user.id)

  const result = await query(
    `UPDATE subscriptions SET ${fields.join(', ')}
     WHERE id = $${idx++} AND user_id = $${idx}
     RETURNING id`,
    values
  )
  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await query(
    `DELETE FROM subscriptions WHERE id = $1 AND user_id = $2 RETURNING id`,
    [params.id, session.user.id]
  )
  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
