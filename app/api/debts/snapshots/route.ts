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
        debt_account_id: z.string().uuid(),
        // null / omitted = no balance recorded for this debt on this date (cleared)
        balance: z.number().nonnegative().nullable(),
      })
    )
    .min(1),
})

// POST /api/debts/snapshots — record balances for a single date across one or more
// debts. Upserts on (debt_account_id, as_of); a null balance clears any existing
// snapshot for that debt/date. Only the caller's own debts are touched.
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

    const owned = await client.query<{ id: string }>(
      `SELECT id FROM debt_accounts WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [session.user.id, values.map((v) => v.debt_account_id)]
    )
    const ownedIds = new Set(owned.rows.map((r) => r.id))

    let written = 0
    for (const v of values) {
      if (!ownedIds.has(v.debt_account_id)) continue
      if (v.balance === null) {
        await client.query(
          `DELETE FROM debt_snapshots WHERE debt_account_id = $1 AND as_of = $2`,
          [v.debt_account_id, as_of]
        )
      } else {
        await client.query(
          `INSERT INTO debt_snapshots (debt_account_id, as_of, balance)
           VALUES ($1, $2, $3)
           ON CONFLICT (debt_account_id, as_of)
           DO UPDATE SET balance = EXCLUDED.balance, updated_at = NOW()`,
          [v.debt_account_id, as_of, v.balance]
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
