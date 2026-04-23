import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export default async function InvestingPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [watchlistCount, tooHardCount] = await Promise.all([
    query(`SELECT COUNT(*) FROM watchlist_entries WHERE user_id = $1`, [session.user.id]),
    query(`SELECT COUNT(*) FROM too_hard_entries WHERE user_id = $1`, [session.user.id]),
  ])

  const watchlist = parseInt(watchlistCount.rows[0].count, 10)
  const tooHard = parseInt(tooHardCount.rows[0].count, 10)

  return (
    <div className="page-container">
      <h1 className="page-title">Rule #1 Investing</h1>
      <div className="investing-hub">
        <Link href="/investing/calculator" className="investing-hub__card">
          <h2 className="investing-hub__card-title">Big 5 Calculator</h2>
          <p className="investing-hub__card-desc">
            Analyze a stock&apos;s Big 5 growth numbers, calculate sticker price and margin of safety.
          </p>
        </Link>
        <Link href="/investing/watchlist" className="investing-hub__card">
          <h2 className="investing-hub__card-title">Watchlist</h2>
          <p className="investing-hub__card-desc">
            {watchlist} {watchlist === 1 ? 'stock' : 'stocks'} tracked. View live prices, 4Ms, and technical indicators.
          </p>
        </Link>
        <Link href="/investing/too-hard" className="investing-hub__card">
          <h2 className="investing-hub__card-title">Too Hard Pile</h2>
          <p className="investing-hub__card-desc">
            {tooHard} {tooHard === 1 ? 'stock' : 'stocks'} passed on. Stocks you&apos;ve consciously decided not to pursue.
          </p>
        </Link>
      </div>
    </div>
  )
}
