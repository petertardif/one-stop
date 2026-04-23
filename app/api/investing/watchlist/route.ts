import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const addSchema = z.object({
  ticker: z.string().min(1).max(10).transform((v) => v.toUpperCase()),
  company_name: z.string().min(1),
  sector: z.string().nullable().optional(),
  sticker_price: z.number().nullable().optional(),
  mos_price: z.number().nullable().optional(),
  growth_rate_used: z.number().nullable().optional(),
  big5_data: z.record(z.unknown()).nullable().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await query(
    `SELECT we.id, we.sticker_price, we.mos_price, we.growth_rate_used, we.big5_data, we.added_at,
            s.ticker, s.company_name, s.sector
     FROM watchlist_entries we
     JOIN stocks s ON s.id = we.stock_id
     WHERE we.user_id = $1
     ORDER BY we.added_at DESC`,
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

  // Upsert stock
  const stockResult = await query<{ id: string }>(
    `INSERT INTO stocks (ticker, company_name, sector)
     VALUES ($1, $2, $3)
     ON CONFLICT (ticker) DO UPDATE
       SET company_name = EXCLUDED.company_name,
           sector = COALESCE(EXCLUDED.sector, stocks.sector),
           updated_at = NOW()
     RETURNING id`,
    [d.ticker, d.company_name, d.sector ?? null]
  )

  const stockId = stockResult.rows[0].id

  // Check already on watchlist
  const existing = await query(
    `SELECT id FROM watchlist_entries WHERE user_id = $1 AND stock_id = $2`,
    [session.user.id, stockId]
  )
  if (existing.rowCount && existing.rowCount > 0) {
    return NextResponse.json({ error: 'Already on watchlist' }, { status: 409 })
  }

  const entryResult = await query<{ id: string }>(
    `INSERT INTO watchlist_entries (user_id, stock_id, sticker_price, mos_price, growth_rate_used, big5_data)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      session.user.id,
      stockId,
      d.sticker_price ?? null,
      d.mos_price ?? null,
      d.growth_rate_used ?? null,
      d.big5_data ? JSON.stringify(d.big5_data) : null,
    ]
  )

  return NextResponse.json({ id: entryResult.rows[0].id, stock_id: stockId }, { status: 201 })
}
