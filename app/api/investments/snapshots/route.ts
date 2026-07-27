import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { pool } from '@/lib/db'

const schema = z.object({
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  values: z
    .array(
      z.object({
        investment_id: z.string().uuid(),
        // null / omitted = no balance recorded for this account on this date (skipped)
        value: z.number().nonnegative().nullable(),
      })
    )
    .min(1),
})

// POST /api/investments/snapshots — record balances for a single date across one
// or more accounts. Upserts on (investment_id, as_of); a null value clears any
// existing snapshot for that account/date. Only the caller's own accounts are touched.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { as_of, values } = parsed.data

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Restrict to investments the caller owns.
    const owned = await client.query<{ id: string }>(
      `SELECT id FROM investments WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [session.user.id, values.map((v) => v.investment_id)]
    )
    const ownedIds = new Set(owned.rows.map((r) => r.id))

    let written = 0
    for (const v of values) {
      if (!ownedIds.has(v.investment_id)) continue
      if (v.value === null) {
        await client.query(
          `DELETE FROM investment_snapshots WHERE investment_id = $1 AND as_of = $2`,
          [v.investment_id, as_of]
        )
      } else {
        await client.query(
          `INSERT INTO investment_snapshots (investment_id, as_of, value)
           VALUES ($1, $2, $3)
           ON CONFLICT (investment_id, as_of)
           DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [v.investment_id, as_of, v.value]
        )
        written++
      }
    }

    await client.query('COMMIT')
    return NextResponse.json({ written })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
