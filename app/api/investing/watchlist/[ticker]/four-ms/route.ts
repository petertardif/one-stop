import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const MOAT_TYPES = ['brand', 'switching', 'toll', 'cost', 'secret'] as const

const schema = z.object({
  meaning_notes: z.string().nullable().optional(),
  moat_type: z.enum(MOAT_TYPES).nullable().optional(),
  moat_notes: z.string().nullable().optional(),
  management_notes: z.string().nullable().optional(),
  mos_notes: z.string().nullable().optional(),
})

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

  const result = await query(`SELECT * FROM four_ms_entries WHERE watchlist_entry_id = $1`, [entryId])
  return NextResponse.json(result.rows[0] ?? null)
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
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const entryId = await getEntryId(params.ticker, session.user.id)
  if (!entryId) return NextResponse.json({ error: 'Watchlist entry not found' }, { status: 404 })

  const d = parsed.data
  await query(
    `INSERT INTO four_ms_entries
       (watchlist_entry_id, meaning_notes, moat_type, moat_notes, management_notes, mos_notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (watchlist_entry_id) DO UPDATE SET
       meaning_notes = EXCLUDED.meaning_notes,
       moat_type = EXCLUDED.moat_type,
       moat_notes = EXCLUDED.moat_notes,
       management_notes = EXCLUDED.management_notes,
       mos_notes = EXCLUDED.mos_notes,
       updated_at = NOW()`,
    [
      entryId,
      d.meaning_notes ?? null,
      d.moat_type ?? null,
      d.moat_notes ?? null,
      d.management_notes ?? null,
      d.mos_notes ?? null,
    ]
  )

  return NextResponse.json({ success: true })
}
