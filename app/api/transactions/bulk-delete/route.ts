import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { pool } from '@/lib/db'

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let deleted = 0

    // Delete one at a time so each removal can subtract its amount from the running
    // balance of every later row, preserving the checkbook ledger. Only manual rows
    // are deletable (Plaid rows stay protected). Amount is intrinsic, so processing
    // order does not matter.
    for (const id of parsed.data.ids) {
      const res = await client.query<{ amount: string; seq: string | null }>(
        `DELETE FROM transactions
         WHERE id = $1 AND user_id = $2 AND is_manual = true
         RETURNING amount, seq`,
        [id, session.user.id]
      )
      if (res.rowCount === 0) continue
      deleted++
      const { amount, seq } = res.rows[0]
      if (seq != null) {
        await client.query(
          `UPDATE transactions SET balance = balance - $1
           WHERE user_id = $2 AND seq > $3 AND balance IS NOT NULL`,
          [Number(amount), session.user.id, seq]
        )
      }
    }

    await client.query('COMMIT')
    return NextResponse.json({ deleted })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
