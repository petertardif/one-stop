import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await query(
    `SELECT id, ticker, company_name, sector, reason, growth_rate_used, big5_data, dismissed_at, reanalyzed_at
     FROM too_hard_entries
     WHERE user_id = $1 AND ticker = $2
     ORDER BY dismissed_at DESC LIMIT 1`,
    [session.user.id, params.ticker.toUpperCase()]
  )

  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ entry: result.rows[0] })
}
