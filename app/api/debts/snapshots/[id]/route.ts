import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

// DELETE a single balance snapshot cell (from the drill-down history). Scoped to
// the caller's own debts via the debt_accounts join.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await query(
    `DELETE FROM debt_snapshots s
     USING debt_accounts d
     WHERE s.id = $1 AND s.debt_account_id = d.id AND d.user_id = $2
     RETURNING s.id`,
    [params.id, session.user.id]
  )
  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
