import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

/** Undo a sale: the lot goes back to open (it is not re-merged with any remainder). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await query(
    `UPDATE holding_lots SET sold_on = NULL, sale_price = NULL, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND sold_on IS NOT NULL`,
    [params.id, session.user.id]
  )
  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
