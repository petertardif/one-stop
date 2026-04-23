import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { ticker: string; noteId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await query(
    `DELETE FROM research_notes rn
     USING watchlist_entries we, stocks s
     WHERE rn.id = $1
       AND rn.watchlist_entry_id = we.id
       AND we.stock_id = s.id
       AND s.ticker = $2
       AND we.user_id = $3
     RETURNING rn.id`,
    [params.noteId, params.ticker.toUpperCase(), session.user.id]
  )

  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
