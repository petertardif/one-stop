import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { pool, query } from '@/lib/db'

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string().nullable().optional(),
  term: z.enum(['short', 'long']).default('long'),
  // Optional opening balance — recorded as the debt's first snapshot.
  balance: z.number().nonnegative().nullable().optional(),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

// GET /api/debts — every debt account in manual (sort_order) order, each with its
// full dated balance series (newest first), plus the distinct categories in use
// (so typed values persist in the datalist). Client filters by tab (short/long/paid).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await query(
    `SELECT d.id, d.name, d.category, d.term, d.sort_order, d.paid_at,
            COALESCE(
              (SELECT json_agg(json_build_object('id', s.id, 'as_of', s.as_of, 'balance', s.balance)
                       ORDER BY s.as_of DESC)
               FROM debt_snapshots s WHERE s.debt_account_id = d.id),
              '[]'::json
            ) AS snapshots
     FROM debt_accounts d
     WHERE d.user_id = $1
     ORDER BY d.sort_order NULLS LAST, d.created_at ASC`,
    [session.user.id]
  )

  const cats = await query<{ category: string }>(
    `SELECT DISTINCT category FROM debt_accounts
     WHERE user_id = $1 AND category IS NOT NULL AND category <> ''
     ORDER BY category`,
    [session.user.id]
  )

  return NextResponse.json({ rows: rows.rows, categories: cats.rows.map((c) => c.category) })
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

  // Account + optional opening snapshot are written together so a failed balance
  // insert can never leave a balance-less debt behind.
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const result = await client.query<{ id: string }>(
      `INSERT INTO debt_accounts (user_id, name, category, term, sort_order)
       VALUES ($1, $2, $3, $4,
               (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM debt_accounts WHERE user_id = $1))
       RETURNING id`,
      [session.user.id, d.name, d.category ?? null, d.term]
    )
    const id = result.rows[0].id

    if (d.balance != null) {
      await client.query(
        `INSERT INTO debt_snapshots (debt_account_id, as_of, balance)
         VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3)`,
        [id, d.as_of ?? null, d.balance]
      )
    }

    await client.query('COMMIT')
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
