import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const cadence = z.enum(['none', 'weekly', 'biweekly', 'monthly', 'annual'])
const updateSchema = z.object({
  brokerage: z.string().min(1),
  type: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  type_description: z.string().nullable().optional(),
  contribution_cadence: cadence,
  contribution_amount: z.number().nonnegative().nullable().optional(),
  contribution_note: z.string().nullable().optional(),
  strategy: z.string().nullable().optional(),
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
    `UPDATE investments
     SET brokerage = $3, type = $4, owner = $5, type_description = $6,
         contribution_cadence = $7, contribution_amount = $8, contribution_note = $9,
         strategy = $10, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [
      params.id, session.user.id, d.brokerage, d.type ?? null, d.owner ?? null, d.type_description ?? null,
      d.contribution_cadence, d.contribution_amount ?? null, d.contribution_note ?? null, d.strategy ?? null,
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

  // Snapshots cascade via FK ON DELETE CASCADE.
  const result = await query(
    `DELETE FROM investments WHERE id = $1 AND user_id = $2 RETURNING id`,
    [params.id, session.user.id]
  )
  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
