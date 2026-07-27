import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

// Editable fields plus `archived` (true → set archived_at now, false → restore).
const updateSchema = z.object({
  description: z.string().min(1).optional(),
  due_date: z.string().nullable().optional(),
  pay_type: z.enum(['autopay', 'manual']).optional(),
  duration: z.enum(['annual', 'monthly', 'biweekly', 'weekly']).optional(),
  amount: z.number().optional(),
  category: z.string().nullable().optional(),
  archived: z.boolean().optional(),
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
  const sets: string[] = []
  const values: unknown[] = []
  let i = 1

  for (const field of ['description', 'due_date', 'pay_type', 'duration', 'amount', 'category'] as const) {
    if (d[field] !== undefined) {
      sets.push(`${field} = $${i++}`)
      values.push(d[field])
    }
  }
  if (d.archived !== undefined) {
    sets.push(`archived_at = ${d.archived ? 'NOW()' : 'NULL'}`)
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }
  sets.push('updated_at = NOW()')

  values.push(params.id, session.user.id)
  const result = await query(
    `UPDATE budget_items SET ${sets.join(', ')}
     WHERE id = $${i++} AND user_id = $${i}
     RETURNING id`,
    values
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ id: result.rows[0].id })
}
