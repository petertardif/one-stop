import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { LOT_COLUMNS, soldLotSchema } from '@/lib/holdings'

/** Edit a sold lot: purchase details, shares, notes and the sale itself. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = soldLotSchema.safeParse(await req.json())
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? 'Invalid lot'
    return NextResponse.json({ error: first }, { status: 400 })
  }
  const d = parsed.data

  const result = await query(
    `UPDATE holding_lots
     SET shares = $3, price = $4, fee = $5, bought_on = $6, notes = $7,
         sold_on = $8, sale_price = $9, sale_fee = $10, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND sold_on IS NOT NULL
     RETURNING ${LOT_COLUMNS}`,
    [params.id, session.user.id, d.shares, d.price, d.fee, d.bought_on, d.notes ?? null,
      d.sold_on, d.sale_price, d.sale_fee]
  )
  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(result.rows[0])
}
