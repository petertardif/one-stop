import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { WatchlistClient, WatchlistRow } from './WatchlistClient'

export default async function WatchlistPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const result = await query(
    `SELECT we.id, we.sticker_price, we.mos_price, we.growth_rate_used, we.added_at,
            s.ticker, s.company_name, s.sector
     FROM watchlist_entries we
     JOIN stocks s ON s.id = we.stock_id
     WHERE we.user_id = $1
     ORDER BY we.added_at DESC`,
    [session.user.id]
  )

  return (
    <div className="page-container page-container--wide">
      <div className="dashboard__section-header" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Watchlist</h1>
        <Link href="/investing/calculator" className="btn-sm btn-secondary">+ Analyze Stock</Link>
      </div>
      <WatchlistClient
        initialRows={result.rows as WatchlistRow[]}
        isAdmin={session.user.role === 'admin'}
      />
    </div>
  )
}
