import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { StockDetailClient } from './StockDetailClient'

type MoatType = 'brand' | 'switching' | 'toll' | 'cost' | 'secret'

interface FourMs {
  meaning_notes: string | null
  moat_type: MoatType | null
  moat_notes: string | null
  management_notes: string | null
  mos_notes: string | null
}

interface Note {
  id: string
  content: string
  created_at: string
}

interface Props {
  params: { ticker: string }
}

export default async function StockDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const ticker = params.ticker.toUpperCase()

  const [entryResult, fourMsResult, notesResult] = await Promise.all([
    query(
      `SELECT we.id, we.sticker_price, we.mos_price, we.growth_rate_used, we.added_at,
              s.ticker, s.company_name, s.sector
       FROM watchlist_entries we
       JOIN stocks s ON s.id = we.stock_id
       WHERE we.user_id = $1 AND s.ticker = $2`,
      [session.user.id, ticker]
    ),
    query(
      `SELECT fm.meaning_notes, fm.moat_type, fm.moat_notes, fm.management_notes, fm.mos_notes
       FROM four_ms_entries fm
       JOIN watchlist_entries we ON we.id = fm.watchlist_entry_id
       JOIN stocks s ON s.id = we.stock_id
       WHERE we.user_id = $1 AND s.ticker = $2`,
      [session.user.id, ticker]
    ),
    query(
      `SELECT rn.id, rn.content, rn.created_at
       FROM research_notes rn
       JOIN watchlist_entries we ON we.id = rn.watchlist_entry_id
       JOIN stocks s ON s.id = we.stock_id
       WHERE we.user_id = $1 AND s.ticker = $2
       ORDER BY rn.created_at DESC`,
      [session.user.id, ticker]
    ),
  ])

  if (entryResult.rows.length === 0) notFound()

  const entry = entryResult.rows[0]

  return (
    <div className="page-container page-container--wide">
      <div className="dashboard__section-header" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div>
          <Link href="/investing/watchlist" className="text-muted" style={{ fontSize: '0.85rem' }}>
            ← Watchlist
          </Link>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            {entry.company_name} <span style={{ color: 'var(--text-muted)' }}>({ticker})</span>
          </h1>
          {entry.sector && <p className="text-muted">{entry.sector}</p>}
        </div>
      </div>
      <StockDetailClient
        ticker={ticker}
        companyName={entry.company_name}
        isAdmin={session.user.role === 'admin'}
        initialFourMs={(fourMsResult.rows[0] as FourMs) ?? null}
        initialNotes={notesResult.rows as Note[]}
      />
    </div>
  )
}
