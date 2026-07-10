import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { FourMsSetupClient } from './FourMsSetupClient'

interface Props {
  searchParams: { ticker?: string }
}

export default async function FourMsSetupPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const ticker = searchParams.ticker?.toUpperCase()
  if (!ticker) redirect('/investing/calculator')

  const result = await query(
    `SELECT s.company_name
     FROM watchlist_entries we
     JOIN stocks s ON s.id = we.stock_id
     WHERE s.ticker = $1 AND we.user_id = $2`,
    [ticker, session.user.id]
  )

  if (result.rows.length === 0) redirect(`/investing/calculator?ticker=${ticker}`)

  const { company_name } = result.rows[0]

  return (
    <div className="page-container page-container--wide">
      <div className="dashboard__section-header" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            {company_name} <span style={{ color: 'var(--text-muted)' }}>({ticker})</span>
          </h1>
          <p className="text-muted">4Ms Analysis</p>
        </div>
        <Link href="/investing/calculator" className="btn-secondary btn-sm">
          <ChevronLeft size={14} /> Calculator
        </Link>
      </div>
      <FourMsSetupClient ticker={ticker} companyName={company_name} />
    </div>
  )
}
