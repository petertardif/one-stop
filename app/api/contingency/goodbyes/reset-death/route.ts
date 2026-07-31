import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

// Parent-only (admin | partner_admin) safety valve to undo a mistaken/curious
// death trigger. Clears the deceased ids too.
export async function POST() {
  const session = await getServerSession(authOptions)
  const role = session?.user.role
  if (!session || (role !== 'admin' && role !== 'partner_admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await query(
    `UPDATE death_event SET died_at = NULL, confirmed_by = NULL, deceased_user_ids = NULL, updated_at = NOW()`
  )
  return NextResponse.json({ ok: true })
}
