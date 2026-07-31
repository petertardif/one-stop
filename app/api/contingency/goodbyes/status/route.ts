import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

// The shared death event — visible to any authenticated user so the messages page
// can decide between the "has a parent died?" gate and the delivery view.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await query<{ died_at: string | null; confirmed_by: string | null; deceased_user_ids: string[] | null }>(
    `SELECT died_at, confirmed_by, deceased_user_ids FROM death_event LIMIT 1`
  )
  return NextResponse.json(res.rows[0] ?? { died_at: null, confirmed_by: null, deceased_user_ids: null })
}
