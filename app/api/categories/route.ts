import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const DEFAULT_CATEGORIES = [
  'ALCOHOL', 'CAR', 'DOGS', 'ENTERTAINMENT', 'FINANCIAL', 'GAS', 'GIFTS',
  'GROCERIES', 'HEALTHCARE', 'HOUSE', 'INCOME', 'JOB RELATED', 'KIDS',
  'KIDS SPORTS', 'MONTHLY BILLS', 'OTHER', 'RESTAURANT', 'SHOPPING',
  'TAKEOUT', 'TRAVEL', 'XMAS',
]

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await query<{ category: string }>(
    `SELECT DISTINCT category FROM transactions
     WHERE user_id = $1 AND category IS NOT NULL
     ORDER BY category`,
    [session.user.id]
  )

  const fromDb = result.rows.map((r) => r.category)
  const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...fromDb])).sort()

  return NextResponse.json(merged)
}
