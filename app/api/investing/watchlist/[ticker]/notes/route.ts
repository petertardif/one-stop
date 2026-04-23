import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

async function getEntryId(ticker: string, userId: string): Promise<string | null> {
  const res = await query(
    `SELECT we.id FROM watchlist_entries we
     JOIN stocks s ON s.id = we.stock_id
     WHERE s.ticker = $1 AND we.user_id = $2`,
    [ticker.toUpperCase(), userId]
  )
  return res.rows[0]?.id ?? null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entryId = await getEntryId(params.ticker, session.user.id)
  if (!entryId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await query(
    `SELECT id, content, created_at FROM research_notes
     WHERE watchlist_entry_id = $1 ORDER BY created_at DESC`,
    [entryId]
  )
  return NextResponse.json(result.rows)
}

export async function POST(
  req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = z.object({ content: z.string().min(1) }).safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const entryId = await getEntryId(params.ticker, session.user.id)
  if (!entryId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await query(
    `INSERT INTO research_notes (watchlist_entry_id, content) VALUES ($1, $2) RETURNING id, content, created_at`,
    [entryId, parsed.data.content]
  )
  return NextResponse.json({ note: result.rows[0] }, { status: 201 })
}
