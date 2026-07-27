import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { pool } from '@/lib/db'

const schema = z.object({
  ids: z.array(z.string().uuid()),
  // Target month (YYYY-MM) chosen in the modal; defaults to next month.
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
})

// Annual = amount × multiplier; Next Monthly = Annual ÷ 12.
const MULTIPLIER: Record<string, number> = { annual: 1, monthly: 12, biweekly: 26, weekly: 52 }

// POST /api/budget-items/add-to-ledger
// Posts each selected budget item into the transactions ledger as an expense
// dated the 1st of next month, category MONTHLY BILLS, amount = Next Monthly.
// Dedupe: skips any bill already posted to that month (matched by budget_item_id),
// so re-running never double-posts. Ledger seq/balance are appended in order.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Target month (0-indexed): the client-selected YYYY-MM, else next month.
  const now = new Date()
  let targetY: number
  let targetM: number
  if (parsed.data.month) {
    const [yy, mm] = parsed.data.month.split('-').map(Number)
    targetY = yy
    targetM = mm - 1
  } else {
    targetY = now.getUTCFullYear()
    targetM = now.getUTCMonth() + 1 // next month
  }
  const monthStr = new Date(Date.UTC(targetY, targetM, 1)).toISOString().slice(0, 7) // YYYY-MM
  const lastDay = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate() // last day of target month

  // Post date = the item's Due Date day in the target month, clamped to the
  // month's length (e.g. 31 → Feb 28/29). No Due Date defaults to the 1st.
  const dateForItem = (dueDate: string | null): string => {
    const day = parseInt(dueDate ?? '', 10)
    const clamped = Number.isNaN(day) ? 1 : Math.min(Math.max(day, 1), lastDay)
    return new Date(Date.UTC(targetY, targetM, clamped)).toISOString().slice(0, 10)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const items = await client.query<{ id: string; description: string; duration: string; amount: string; due_date: string | null }>(
      `SELECT id, description, duration, amount, due_date FROM budget_items
       WHERE user_id = $1 AND archived_at IS NULL AND id = ANY($2::uuid[])`,
      [session.user.id, parsed.data.ids]
    )

    const latest = await client.query<{ seq: string | null; balance: string | null }>(
      `SELECT seq, balance FROM transactions
       WHERE user_id = $1 ORDER BY seq DESC NULLS LAST, created_at DESC LIMIT 1`,
      [session.user.id]
    )
    let seq = latest.rows[0]?.seq != null ? Number(latest.rows[0].seq) : 0
    let balance = latest.rows[0]?.balance != null ? Number(latest.rows[0].balance) : 0

    let posted = 0
    let skipped = 0
    for (const item of items.rows) {
      const dupe = await client.query(
        `SELECT 1 FROM transactions
         WHERE user_id = $1 AND budget_item_id = $2 AND to_char(date, 'YYYY-MM') = $3
         LIMIT 1`,
        [session.user.id, item.id, monthStr]
      )
      if ((dupe.rowCount ?? 0) > 0) {
        skipped++
        continue
      }

      const annual = Number(item.amount) * (MULTIPLIER[item.duration] ?? 1)
      const nextMonthly = Math.round((annual / 12) * 100) / 100
      const amount = -nextMonthly // expense → negative
      seq += 1
      balance = Math.round((balance + amount) * 100) / 100

      await client.query(
        `INSERT INTO transactions
           (user_id, is_manual, seq, amount, type, category, description, date, is_posted, balance, budget_item_id)
         VALUES ($1, true, $2, $3, 'expense', 'MONTHLY BILLS', $4, $5, false, $6, $7)`,
        [session.user.id, seq, amount, item.description, dateForItem(item.due_date), balance, item.id]
      )
      posted++
    }

    await client.query('COMMIT')
    return NextResponse.json({ posted, skipped })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
