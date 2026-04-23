import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const addSchema = z.object({
  ticker: z.string().min(1).max(10).transform((v) => v.toUpperCase()),
  company_name: z.string().min(1),
  reason: z.string().nullable().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await query(
    `SELECT id, ticker, company_name, reason, dismissed_at
     FROM too_hard_entries WHERE user_id = $1 ORDER BY dismissed_at DESC`,
    [session.user.id]
  )
  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = addSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data

  // Remove from watchlist if present
  await query(
    `DELETE FROM watchlist_entries we
     USING stocks s
     WHERE we.stock_id = s.id AND s.ticker = $1 AND we.user_id = $2`,
    [d.ticker, session.user.id]
  )

  const result = await query<{ id: string }>(
    `INSERT INTO too_hard_entries (user_id, ticker, company_name, reason)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [session.user.id, d.ticker, d.company_name, d.reason ?? null]
  )

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 })
}
