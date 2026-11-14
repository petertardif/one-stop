import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { pool, query } from '@/lib/db'
import { LOT_COLUMNS, lotSchema } from '@/lib/holdings'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sold = new URL(req.url).searchParams.get('status') === 'sold'
  const result = await query(
    sold
      ? `SELECT ${LOT_COLUMNS} FROM holding_lots
         WHERE user_id = $1 AND sold_on IS NOT NULL
         ORDER BY sold_on DESC, ticker, bought_on`
      : `SELECT ${LOT_COLUMNS} FROM holding_lots
         WHERE user_id = $1 AND sold_on IS NULL
         ORDER BY bought_on DESC, created_at DESC`,
    [session.user.id]
  )
  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: unknown = await req.json()
  const parsed = lotSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const d = parsed.data
  const fromWatchlist = typeof body === 'object' && body !== null && (body as Record<string, unknown>).from_watchlist === true

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ins = await client.query(
      `INSERT INTO holding_lots (user_id, ticker, company_name, shares, price, bought_on, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${LOT_COLUMNS}`,
      [session.user.id, d.ticker, d.company_name, d.shares, d.price, d.bought_on, d.notes ?? null]
    )
    if (fromWatchlist) {
      await client.query(
        `DELETE FROM watchlist_entries we USING stocks s
         WHERE we.stock_id = s.id AND we.user_id = $1 AND s.ticker = $2`,
        [session.user.id, d.ticker]
      )
    }
    await client.query('COMMIT')
    return NextResponse.json(ins.rows[0], { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
