import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { WatchlistClient, WatchlistRow } from './watchlist/WatchlistClient'
import { TooHardClient, TooHardRow } from './too-hard/TooHardClient'

export const dynamic = 'force-dynamic'

export default async function InvestingPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [watchlistResult, tooHardResult] = await Promise.all([
    query(
      `SELECT we.id, we.sticker_price, we.mos_price, we.growth_rate_used, we.added_at,
              s.ticker, s.company_name, s.sector
       FROM watchlist_entries we
       JOIN stocks s ON s.id = we.stock_id
       WHERE we.user_id = $1
       ORDER BY we.added_at DESC`,
      [session.user.id]
    ),
    query(
      `SELECT id, ticker, company_name, reason, dismissed_at
       FROM too_hard_entries
       WHERE user_id = $1
       ORDER BY dismissed_at DESC`,
      [session.user.id]
    ),
  ])

  return (
    <div className="page-container page-container--wide">
      <div className="dashboard__section-header" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Investing</h1>
        <Link href="/investing/calculator" className="btn-sm btn-secondary">+ Analyze Stock</Link>
      </div>

      <section style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="section-label">Watchlist</h2>
        <WatchlistClient
          initialRows={watchlistResult.rows as WatchlistRow[]}
          isAdmin={session.user.role === 'admin'}
        />
      </section>

      <section>
        <h2 className="section-label">Too Hard Pile</h2>
        <TooHardClient initialRows={tooHardResult.rows as TooHardRow[]} />
      </section>
    </div>
  )
}
