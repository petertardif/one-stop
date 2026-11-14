import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { LOT_COLUMNS, lotSchema } from '@/lib/holdings'

const UUID_RE = /^[0-9a-f-]{36}$/i

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = lotSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const d = parsed.data

  const result = await query(
    `UPDATE holding_lots
     SET ticker = $3, company_name = $4, shares = $5, price = $6, bought_on = $7, notes = $8, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING ${LOT_COLUMNS}`,
    [params.id, session.user.id, d.ticker, d.company_name, d.shares, d.price, d.bought_on, d.notes ?? null]
  )
  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(result.rows[0])
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await query(`DELETE FROM holding_lots WHERE id = $1 AND user_id = $2`, [params.id, session.user.id])
  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
