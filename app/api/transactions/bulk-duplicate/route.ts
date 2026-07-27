import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { pool } from '@/lib/db'

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1),
})

interface SourceRow {
  account_id: string | null
  amount: string
  type: string
  category: string | null
  description: string | null
  check_number: string | null
  date: string
  is_posted: boolean
  budget_flagged: boolean
  budget_account: string | null
  notes: string | null
}

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

    // Fetch the selected rows in ledger order so copies keep a sensible relative order.
    const rows = await client.query<SourceRow>(
      `SELECT account_id, amount, type, category, description, check_number,
              date, is_posted, budget_flagged, budget_account, notes
       FROM transactions
       WHERE user_id = $1 AND id = ANY($2::uuid[])
       ORDER BY seq ASC NULLS FIRST, created_at ASC`,
      [session.user.id, parsed.data.ids]
    )

    // Copies are appended to the end of the ledger (newest seq) and extend the running
    // balance from the current tail. Each copy is a manual transaction (editable/
    // deletable) and keeps the original date; only the description gets a "Copy of:".
    const tail = await client.query<{ seq: string | null; balance: string | null }>(
      `SELECT seq, balance FROM transactions
       WHERE user_id = $1
       ORDER BY seq DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [session.user.id]
    )
    let seq = tail.rows[0]?.seq != null ? Number(tail.rows[0].seq) : 0
    let balance = tail.rows[0]?.balance != null ? Number(tail.rows[0].balance) : 0

    let duplicated = 0
    for (const r of rows.rows) {
      seq += 1
      balance = Math.round((balance + Number(r.amount)) * 100) / 100
      const description = `Copy of: ${r.description ?? ''}`.trimEnd()
      await client.query(
        `INSERT INTO transactions
           (user_id, account_id, is_manual, seq, amount, type, category, description,
            check_number, date, is_posted, budget_flagged, budget_account, balance, notes)
         VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          session.user.id,
          r.account_id,
          seq,
          r.amount,
          r.type,
          r.category,
          description,
          r.check_number,
          r.date,
          r.is_posted,
          r.budget_flagged,
          r.budget_account,
          balance,
          r.notes,
        ]
      )
      duplicated++
    }

    await client.query('COMMIT')
    return NextResponse.json({ duplicated })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
