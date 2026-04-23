import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const updateSchema = z.object({
  sticker_price: z.number().nullable().optional(),
  mos_price: z.number().nullable().optional(),
  growth_rate_used: z.number().nullable().optional(),
  big5_data: z.record(z.unknown()).nullable().optional(),
})

async function getEntry(ticker: string, userId: string) {
  return query(
    `SELECT we.id, we.sticker_price, we.mos_price, we.growth_rate_used, we.big5_data, we.added_at,
            s.ticker, s.company_name, s.sector
     FROM watchlist_entries we
     JOIN stocks s ON s.id = we.stock_id
     WHERE s.ticker = $1 AND we.user_id = $2`,
    [ticker.toUpperCase(), userId]
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entryRes = await getEntry(params.ticker, session.user.id)
  if (entryRes.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const entry = entryRes.rows[0]

  const [fourMsRes, notesRes] = await Promise.all([
    query(`SELECT * FROM four_ms_entries WHERE watchlist_entry_id = $1`, [entry.id]),
    query(
      `SELECT id, content, created_at FROM research_notes WHERE watchlist_entry_id = $1 ORDER BY created_at DESC`,
      [entry.id]
    ),
  ])

  return NextResponse.json({
    entry,
    fourMs: fourMsRes.rows[0] ?? null,
    notes: notesRes.rows,
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const entryRes = await getEntry(params.ticker, session.user.id)
  if (entryRes.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const d = parsed.data
  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (d.sticker_price !== undefined) { fields.push(`sticker_price = $${idx++}`); values.push(d.sticker_price) }
  if (d.mos_price !== undefined) { fields.push(`mos_price = $${idx++}`); values.push(d.mos_price) }
  if (d.growth_rate_used !== undefined) { fields.push(`growth_rate_used = $${idx++}`); values.push(d.growth_rate_used) }
  if (d.big5_data !== undefined) { fields.push(`big5_data = $${idx++}`); values.push(JSON.stringify(d.big5_data)) }

  if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  fields.push(`updated_at = NOW()`)
  values.push(entryRes.rows[0].id)

  await query(`UPDATE watchlist_entries SET ${fields.join(', ')} WHERE id = $${idx}`, values)
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const entryRes = await getEntry(params.ticker, session.user.id)
  if (entryRes.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await query(`DELETE FROM watchlist_entries WHERE id = $1`, [entryRes.rows[0].id])
  return NextResponse.json({ success: true })
}
