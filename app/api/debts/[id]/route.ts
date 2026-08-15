import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { paidWithFor } from '@/lib/debts'

const updateSchema = z.object({
  name: z.string().min(1),
  category: z.string().nullable().optional(),
  term: z.enum(['short', 'long']),
  paid_with: z.enum(['bank', 'chase_cc', 'boa_cc']).nullable().optional(),
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
    `UPDATE debt_accounts
     SET name = $3, category = $4, term = $5, paid_with = $6, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [params.id, session.user.id, d.name, d.category ?? null, d.term, paidWithFor(d.term, d.paid_with)]
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

  // Snapshots cascade via FK ON DELETE CASCADE.
  const result = await query(
    `DELETE FROM debt_accounts WHERE id = $1 AND user_id = $2 RETURNING id`,
    [params.id, session.user.id]
  )
  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
