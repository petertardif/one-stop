import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { sendDeathTriggerEmail } from '@/lib/email'

const bodySchema = z.object({
  deceased_ids: z.array(z.string().uuid()).min(1).max(2),
})

// Anyone signed in (a surviving parent or a dependent) can confirm the death gate,
// picking which parent(s) passed away. This is the irreversible trigger: it sets
// the shared died_at to NOW() and records the deceased parent ids (idempotent —
// only the first confirm wins). The picked ids must be parents (admin|partner_admin).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const deceasedIds = Array.from(new Set(parsed.data.deceased_ids))

  // Every picked id must belong to a parent (admin or partner_admin).
  const parents = await query<{ id: string }>(
    `SELECT id FROM users WHERE id = ANY($1) AND role IN ('admin', 'partner_admin')`,
    [deceasedIds]
  )
  if (parents.rows.length !== deceasedIds.length) {
    return NextResponse.json({ error: 'The deceased must be a parent (admin or partner admin).' }, { status: 400 })
  }

  const upd = await query<{ died_at: string }>(
    `UPDATE death_event SET died_at = NOW(), confirmed_by = $1, deceased_user_ids = $2, updated_at = NOW()
     WHERE died_at IS NULL
     RETURNING died_at`,
    [session.user.id, deceasedIds]
  )
  const firstTime = (upd.rowCount ?? 0) > 0

  if (firstTime) {
    // Best-effort: notify the surviving parent(s) so a mistaken trigger can be
    // reset. Never let email failure block the trigger.
    try {
      const [survivors, confirmer] = await Promise.all([
        query<{ email: string }>(
          `SELECT email FROM users WHERE role IN ('admin', 'partner_admin') AND NOT (id = ANY($1))`,
          [deceasedIds]
        ),
        query<{ first_name: string | null; email: string }>(
          `SELECT p.first_name, u.email FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1`,
          [session.user.id]
        ),
      ])
      const confirmerName = confirmer.rows[0]?.first_name?.trim() || confirmer.rows[0]?.email || 'Someone'
      await Promise.all(
        survivors.rows.map((s) => (s.email ? sendDeathTriggerEmail(s.email, confirmerName) : null))
      )
    } catch (err) {
      console.error('Death-trigger email failed:', err)
    }
  }

  return NextResponse.json({ ok: true, firstTime })
}
