import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { pool } from '@/lib/db'

const schema = z.object({ ids: z.array(z.string().uuid()).min(1) })

interface SourceRow {
  category: string | null
  service: string | null
  company: string | null
  price_per_year: string | null
  price_per_month: string | null
  renewal_cycle: string
  renewal_day: number | null
  renewal_date: string | null
}

// Duplicate selected active subscriptions as new active rows, with a "Copy of: "
// service prefix. All other fields copied as-is.
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
      `SELECT category, service, company, price_per_year, price_per_month,
              renewal_cycle, renewal_day, renewal_date
       FROM subscriptions
       WHERE user_id = $1 AND id = ANY($2::uuid[]) AND cancelled_at IS NULL
       ORDER BY created_at ASC`,
      [session.user.id, parsed.data.ids]
    )

    let duplicated = 0
    for (const r of rows.rows) {
      await client.query(
        `INSERT INTO subscriptions
           (user_id, category, service, company, price_per_year, price_per_month,
            renewal_cycle, renewal_day, renewal_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          session.user.id,
          r.category,
          `Copy of: ${r.service ?? ''}`.trimEnd(),
          r.company,
          r.price_per_year,
          r.price_per_month,
          r.renewal_cycle,
          r.renewal_day,
          r.renewal_date,
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
