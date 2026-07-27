import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { pool } from '@/lib/db'

const schema = z.object({ ids: z.array(z.string().uuid()).min(1) })

interface SourceRow {
  date: string
  organization: string | null
  donor_name: string | null
  donor_contact: string | null
  amount: string
  payment_method: string
  goods_services_value: string | null
  notes: string | null
}

// Duplicate selected donation rows as new rows with a "Copy of: " organization
// prefix, appended to the log tail (fresh sort_order). All other fields copied.
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

    const rows = await client.query<SourceRow>(
      `SELECT date, organization, donor_name, donor_contact, amount,
              payment_method, goods_services_value, notes
       FROM charitable_donations
       WHERE user_id = $1 AND id = ANY($2::uuid[])
       ORDER BY sort_order NULLS LAST, created_at ASC`,
      [session.user.id, parsed.data.ids]
    )

    let duplicated = 0
    for (const r of rows.rows) {
      await client.query(
        `INSERT INTO charitable_donations
           (user_id, date, organization, donor_name, donor_contact, amount,
            payment_method, goods_services_value, notes, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM charitable_donations WHERE user_id = $1))`,
        [
          session.user.id, r.date, `Copy of: ${r.organization ?? ''}`.trimEnd(),
          r.donor_name, r.donor_contact, r.amount, r.payment_method,
          r.goods_services_value, r.notes,
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
