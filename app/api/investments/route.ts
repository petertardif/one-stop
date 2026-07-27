import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const cadence = z.enum(['none', 'weekly', 'biweekly', 'monthly', 'annual'])
const createSchema = z.object({
  brokerage: z.string().min(1),
  type: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  type_description: z.string().nullable().optional(),
  contribution_cadence: cadence.default('none'),
  contribution_amount: z.number().nonnegative().nullable().optional(),
  contribution_note: z.string().nullable().optional(),
  strategy: z.string().nullable().optional(),
})

// GET /api/investments — every account in manual (sort_order) order, each with its
// full dated snapshot series (newest first). Also returns the distinct snapshot
// dates across the portfolio, so the client can build the charts + summary columns.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await query(
    `SELECT i.id, i.brokerage, i.type, i.owner, i.type_description,
            i.contribution_cadence, i.contribution_amount, i.contribution_note,
            i.strategy, i.sort_order, i.liquidated_at,
            COALESCE(
              (SELECT json_agg(json_build_object('id', s.id, 'as_of', s.as_of, 'value', s.value)
                       ORDER BY s.as_of DESC)
               FROM investment_snapshots s WHERE s.investment_id = i.id),
              '[]'::json
            ) AS snapshots
     FROM investments i
     WHERE i.user_id = $1
     ORDER BY i.sort_order NULLS LAST, i.created_at ASC`,
    [session.user.id]
  )

  const dates = await query<{ as_of: string }>(
    `SELECT DISTINCT s.as_of
     FROM investment_snapshots s
     JOIN investments i ON i.id = s.investment_id
     WHERE i.user_id = $1
     ORDER BY s.as_of DESC`,
    [session.user.id]
  )

  return NextResponse.json({
    rows: rows.rows,
    dates: dates.rows.map((d) => (typeof d.as_of === 'string' ? d.as_of.slice(0, 10) : d.as_of)),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const d = parsed.data

  const result = await query<{ id: string }>(
    `INSERT INTO investments
       (user_id, brokerage, type, owner, type_description, contribution_cadence, contribution_amount, contribution_note, strategy, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM investments WHERE user_id = $1))
     RETURNING id`,
    [
      session.user.id, d.brokerage, d.type ?? null, d.owner ?? null, d.type_description ?? null,
      d.contribution_cadence, d.contribution_amount ?? null, d.contribution_note ?? null, d.strategy ?? null,
    ]
  )

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 })
}
