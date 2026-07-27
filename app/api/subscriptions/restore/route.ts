import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const schema = z.object({ ids: z.array(z.string().uuid()).min(1) })

// Restore selected cancelled subscriptions back to the Active tab.
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
    `UPDATE subscriptions SET cancelled_at = NULL, updated_at = NOW()
     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND cancelled_at IS NOT NULL
     RETURNING id`,
    [session.user.id, parsed.data.ids]
  )
  return NextResponse.json({ restored: result.rowCount })
}
