import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { pool } from '@/lib/db'
import { fromMicro, sellSchema, toMicro } from '@/lib/holdings'

interface OpenLot {
  id: string
  shares: string
}

/**
 * Sell shares of a ticker, closing open lots oldest-first (FIFO). A lot fully
 * covered by the sale is marked sold; a partly covered lot is split into an
 * open remainder and a new sold lot carrying the same purchase details.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = sellSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const d = parsed.data
  const soldMicro = toMicro(d.shares)
  let remaining = soldMicro
  // Split the sale fee across the closed lots by shares, in whole cents; the last
  // lot takes the rounding remainder so the pieces sum to the fee exactly.
  const feeCents = BigInt(Math.round(d.fee * 100))
  let feeLeft = feeCents
  const feeFor = (pieceMicro: number) => {
    const isLast = pieceMicro >= remaining
    const cents = isLast ? feeLeft : (feeCents * BigInt(pieceMicro)) / BigInt(soldMicro)
    feeLeft -= cents
    return (Number(cents) / 100).toFixed(2)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const lots = await client.query<OpenLot>(
      `SELECT id, shares FROM holding_lots
       WHERE user_id = $1 AND ticker = $2 AND sold_on IS NULL
       ORDER BY bought_on, created_at
       FOR UPDATE`,
      [session.user.id, d.ticker]
    )
    const owned = lots.rows.reduce((sum, l) => sum + toMicro(l.shares), 0)
    if (remaining > owned) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `You own ${fromMicro(owned)} shares of ${d.ticker}` }, { status: 400 })
    }

    for (const lot of lots.rows) {
      if (remaining <= 0) break
      const lotMicro = toMicro(lot.shares)
      if (lotMicro <= remaining) {
        await client.query(
          `UPDATE holding_lots SET sold_on = $2, sale_price = $3, sale_fee = $4, updated_at = NOW() WHERE id = $1`,
          [lot.id, d.sold_on, d.price, feeFor(lotMicro)]
        )
        remaining -= lotMicro
      } else {
        await client.query(
          `INSERT INTO holding_lots (user_id, ticker, company_name, shares, price, fee, bought_on, notes, sold_on, sale_price, sale_fee)
           SELECT user_id, ticker, company_name, $2, price, ROUND(fee * $2::numeric / shares, 2), bought_on, notes, $3, $4, $5
           FROM holding_lots WHERE id = $1`,
          [lot.id, fromMicro(remaining), d.sold_on, d.price, feeFor(remaining)]
        )
        // The sold piece took its pro-rata share of the fee; the remainder keeps the rest.
        await client.query(
          `UPDATE holding_lots
           SET fee = fee - ROUND(fee * $3::numeric / shares, 2), shares = $2, updated_at = NOW()
           WHERE id = $1`,
          [lot.id, fromMicro(lotMicro - remaining), fromMicro(remaining)]
        )
        remaining = 0
      }
    }
    await client.query('COMMIT')
    return NextResponse.json({ success: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
