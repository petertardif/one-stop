'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { calcSticker } from '@/lib/indicators'
import { Big5Table } from '@/components/investing/Big5Table'
import { StickerPricePanel } from '@/components/investing/StickerPricePanel'
import { FourMsPanel } from './FourMsPanel'
import { TechnicalPanel } from './TechnicalPanel'
import { ResearchNotesPanel } from './ResearchNotesPanel'
import { Spinner } from '@/components/Spinner'
import { InvestingError } from '@/components/investing/InvestingError'

type MoatType = 'brand' | 'switching' | 'toll' | 'cost' | 'secret'
type GrowthRates = { y1: number | null; y5: number | null; y10: number | null }

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

interface Big5Snapshot {
  salesGrowth: GrowthRates
  epsGrowth: GrowthRates
  equityGrowth: GrowthRates
  fcfGrowth: GrowthRates
  roic: GrowthRates | number | null
  currentEps: number | null
  currentPrice: number | null
  analystEstimate: number | null
}

interface FmpBig5Response {
  profile: { companyName: string; sector: string; price: number; eps: number }
  salesGrowth: GrowthRates
  epsGrowth: GrowthRates
  equityGrowth: GrowthRates
  fcfGrowth: GrowthRates
  roic: GrowthRates
  analystGrowthRate: number | null
  effectiveGrowthRate: number
  sticker: { futureEPS: number; defaultPE: number; futurePrice: number; stickerPrice: number; mosPrice: number }
}

interface Props {
  ticker: string
  isAdmin: boolean
  initialFourMs: FourMs | null
  initialNotes: Note[]
  big5Data: Big5Snapshot | null
  growthRateUsed: number | null
}

function normalizeRoic(roic: GrowthRates | number | null): GrowthRates {
  if (roic !== null && typeof roic === 'object') return roic as GrowthRates
  return { y1: typeof roic === 'number' ? roic : null, y5: null, y10: null }
}

export function StockDetailClient({ ticker, isAdmin, initialFourMs, initialNotes, big5Data, growthRateUsed }: Props) {
  const [fmpData, setFmpData] = useState<FmpBig5Response | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  async function handleRefresh() {
    setIsRefreshing(true)
    setRefreshError(null)
    const res = await fetch(`/api/investing/fmp/${ticker}?data=big5`)
    if (!res.ok) {
      try {
        const err = await res.json()
        setRefreshError(err.error ?? 'Could not fetch from API.')
      } catch {
        setRefreshError('Could not fetch from API.')
      }
      setIsRefreshing(false)
      return
    }
    setFmpData(await res.json())
    setIsRefreshing(false)
  }

  const normalizedBig5 = big5Data
    ? {
        salesGrowth: big5Data.salesGrowth,
        epsGrowth: big5Data.epsGrowth,
        equityGrowth: big5Data.equityGrowth,
        fcfGrowth: big5Data.fcfGrowth,
        roic: normalizeRoic(big5Data.roic),
      }
    : null

  const savedSticker =
    big5Data?.currentEps && big5Data.currentEps > 0 && growthRateUsed !== null
      ? calcSticker(big5Data.currentEps, growthRateUsed)
      : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xl)' }}>
      <section>
        <div className="dashboard__section-header" style={{ marginBottom: 'var(--spacing-sm)' }}>
          <h2 className="section-label" style={{ marginBottom: 0 }}>Big 5 Growth Numbers</h2>
          <button className="btn-secondary btn-sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw size={13} /> {isRefreshing ? 'Refreshing…' : 'Refresh from API'}
          </button>
        </div>

        {isRefreshing && <Spinner />}

        {refreshError && (
          <InvestingError message="API refresh failed. Saved data is shown below." detail={refreshError} />
        )}

        {fmpData && !isRefreshing && (
          <>
            <div className="calculator__saved-banner">
              <span>Showing fresh data from API — not saved to watchlist.</span>
            </div>
            <Big5Table data={fmpData} />
            <div style={{ marginTop: 'var(--spacing-lg)' }}>
              <h2 className="section-label">Sticker Price &amp; Margin of Safety</h2>
              <StickerPricePanel
                sticker={fmpData.sticker}
                currentPrice={fmpData.profile.price}
                growthRate={fmpData.effectiveGrowthRate}
              />
            </div>
          </>
        )}

        {!fmpData && !isRefreshing && normalizedBig5 && (
          <>
            <Big5Table data={normalizedBig5} />
            {savedSticker && (
              <div style={{ marginTop: 'var(--spacing-lg)' }}>
                <h2 className="section-label">Sticker Price &amp; Margin of Safety</h2>
                <StickerPricePanel
                  sticker={savedSticker}
                  currentPrice={big5Data?.currentPrice ?? undefined}
                  growthRate={growthRateUsed!}
                />
              </div>
            )}
          </>
        )}

        {!fmpData && !isRefreshing && !normalizedBig5 && (
          <p className="dashboard__empty">No Big 5 data saved. Click "Refresh from API" to fetch.</p>
        )}
      </section>

      <section>
        <h2 className="section-label">4Ms Checklist</h2>
        <FourMsPanel ticker={ticker} initial={initialFourMs} isAdmin={isAdmin} />
      </section>

      <section>
        <h2 className="section-label">Technical Indicators</h2>
        <TechnicalPanel ticker={ticker} />
      </section>

      <section>
        <h2 className="section-label">Research Notes</h2>
        <ResearchNotesPanel ticker={ticker} initialNotes={initialNotes} isAdmin={isAdmin} />
      </section>
    </div>
  )
}
