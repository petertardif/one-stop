'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Big5Table } from '@/components/investing/Big5Table'
import { StickerPricePanel } from '@/components/investing/StickerPricePanel'
import { FourMsPanel } from './FourMsPanel'
import { TechnicalPanel } from './TechnicalPanel'
import { ResearchNotesPanel } from './ResearchNotesPanel'
import { Spinner } from '@/components/Spinner'
import { ErrorMessage } from '@/components/ErrorMessage'

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

interface FmpBig5Response {
  profile: { companyName: string; sector: string; price: number; eps: number }
  salesGrowth: { y1: number | null; y5: number | null; y10: number | null }
  epsGrowth: { y1: number | null; y5: number | null; y10: number | null }
  equityGrowth: { y1: number | null; y5: number | null; y10: number | null }
  fcfGrowth: { y1: number | null; y5: number | null; y10: number | null }
  roic: number | null
  analystGrowthRate: number | null
  effectiveGrowthRate: number
  sticker: { futureEPS: number; defaultPE: number; futurePrice: number; stickerPrice: number; mosPrice: number }
}

interface Props {
  ticker: string
  companyName: string
  isAdmin: boolean
  initialFourMs: FourMs | null
  initialNotes: Note[]
}

export function StockDetailClient({ ticker, companyName, isAdmin, initialFourMs, initialNotes }: Props) {
  const router = useRouter()
  const [movingToTooHard, setMovingToTooHard] = useState(false)
  const [reason, setReason] = useState('')
  const [showTooHardForm, setShowTooHardForm] = useState(false)
  const [tooHardError, setTooHardError] = useState<string | null>(null)

  const { data, isFetching, error } = useQuery<FmpBig5Response>({
    queryKey: ['fmp', ticker, 'big5'],
    queryFn: async () => {
      const res = await fetch(`/api/investing/fmp/${ticker}?data=big5`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to fetch data')
      }
      return res.json()
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  async function handleMoveToTooHard() {
    setMovingToTooHard(true)
    setTooHardError(null)
    const res = await fetch('/api/investing/too-hard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, company_name: companyName, reason: reason.trim() || null }),
    })
    if (!res.ok) {
      const d = await res.json()
      setTooHardError(d.error ?? 'Failed')
      setMovingToTooHard(false)
      return
    }
    router.push('/investing/too-hard')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xl)' }}>
      <section>
        <h2 className="section-label">Big 5 Growth Numbers</h2>
        {isFetching && <Spinner />}
        {error && <ErrorMessage message={(error as Error).message} />}
        {data && !isFetching && (
          <>
            <Big5Table data={data} />
            <div style={{ marginTop: 'var(--spacing-lg)' }}>
              <h2 className="section-label">Sticker Price &amp; Margin of Safety</h2>
              <StickerPricePanel
                sticker={data.sticker}
                currentPrice={data.profile.price}
                growthRate={data.effectiveGrowthRate}
              />
            </div>
          </>
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

      {isAdmin && (
        <section>
          {!showTooHardForm ? (
            <button className="btn-secondary btn-sm" onClick={() => setShowTooHardForm(true)}>
              Move to Too Hard Pile
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', maxWidth: 480 }}>
              <label className="form-field">
                <span>Reason (optional)</span>
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you passing on this stock?" />
              </label>
              {tooHardError && <ErrorMessage message={tooHardError} />}
              <div className="form-actions__right">
                <button className="btn-secondary btn-sm" onClick={() => setShowTooHardForm(false)}>Cancel</button>
                <button className="btn-danger btn-sm" onClick={handleMoveToTooHard} disabled={movingToTooHard}>
                  {movingToTooHard ? 'Moving…' : 'Confirm — Move to Too Hard'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
