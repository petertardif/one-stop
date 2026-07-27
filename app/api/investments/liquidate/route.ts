import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const schema = z.object({ ids: z.array(z.string().uuid()).min(1) })

// Liquidate selected active investments (move to the Liquidated tab). Records
// the liquidation timestamp; snapshots/history are left intact.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const result = await query(
    `UPDATE investments SET liquidated_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND liquidated_at IS NULL
     RETURNING id`,
    [session.user.id, parsed.data.ids]
  )
  return NextResponse.json({ liquidated: result.rowCount })
}
