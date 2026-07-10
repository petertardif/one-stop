import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { StockDetailClient } from './StockDetailClient'
import { TooHardButton } from './TooHardButton'
import { EditStockInfoButton } from './EditStockInfoButton'

type MoatType = 'brand' | 'switching' | 'toll' | 'cost' | 'secret'

interface FourMs {
  meaning_notes: string | null
  moat_types: MoatType[]
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
  const isAdmin = session.user.role === 'admin'

  const [entryResult, fourMsResult, notesResult] = await Promise.all([
    query(
      `SELECT we.id, we.sticker_price, we.mos_price, we.growth_rate_used, we.big5_data, we.added_at,
              s.ticker, s.company_name, s.sector
       FROM watchlist_entries we
       JOIN stocks s ON s.id = we.stock_id
       WHERE we.user_id = $1 AND s.ticker = $2`,
      [session.user.id, ticker]
    ),
    query(
      `SELECT fm.meaning_notes, fm.moat_types, fm.moat_notes, fm.management_notes, fm.mos_notes
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

  // Normalize moat_types: fall back to wrapping legacy moat_type if needed
  let fourMs: FourMs | null = null
  if (fourMsResult.rows.length > 0) {
    const row = fourMsResult.rows[0] as FourMs & { moat_type?: string }
    fourMs = {
      meaning_notes: row.meaning_notes,
      moat_types: Array.isArray(row.moat_types) && row.moat_types.length > 0
        ? row.moat_types
        : row.moat_type ? [row.moat_type as MoatType] : [],
      moat_notes: row.moat_notes,
      management_notes: row.management_notes,
      mos_notes: row.mos_notes,
    }
  }

  return (
    <div className="page-container page-container--wide">
      <div className="dashboard__section-header" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-sm)' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 0 }}>
              {entry.company_name} <span style={{ color: 'var(--text-muted)' }}>({ticker})</span>
            </h1>
            {entry.sector && <p className="text-muted">{entry.sector}</p>}
          </div>
          {isAdmin && (
            <EditStockInfoButton
              ticker={ticker}
              initialName={entry.company_name}
              initialSector={entry.sector ?? ''}
            />
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          <Link href="/investing/watchlist" className="btn-secondary btn-sm">
            <ChevronLeft size={14} /> Watchlist
          </Link>
          {isAdmin && <TooHardButton ticker={ticker} companyName={entry.company_name} />}
        </div>
      </div>
      <StockDetailClient
        ticker={ticker}
        isAdmin={isAdmin}
        initialFourMs={fourMs}
        initialNotes={notesResult.rows as Note[]}
        big5Data={entry.big5_data ?? null}
        growthRateUsed={entry.growth_rate_used ? parseFloat(entry.growth_rate_used) : null}
      />
    </div>
  )
}
