'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Big5Table } from '@/components/investing/Big5Table'
import { StickerPricePanel } from '@/components/investing/StickerPricePanel'
import { calcSticker } from '@/lib/indicators'
import { Spinner } from '@/components/Spinner'
import { ErrorMessage } from '@/components/ErrorMessage'

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

export function CalculatorClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [ticker, setTicker] = useState('')
  const [growthOverride, setGrowthOverride] = useState<string>('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

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
    enabled: !!ticker,
    retry: false,
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = input.trim().toUpperCase()
    if (!t) return
    setGrowthOverride('')
    setAddError(null)
    setTicker(t)
  }

  const effectiveRate = growthOverride !== ''
    ? parseFloat(growthOverride) / 100
    : data?.effectiveGrowthRate ?? 0

  const stickerDisplay = data
    ? (growthOverride !== '' ? calcSticker(data.profile.eps, effectiveRate) : data.sticker)
    : null

  async function addToWatchlist() {
    if (!data || !ticker) return
    setAdding(true)
    setAddError(null)
    const res = await fetch('/api/investing/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        company_name: data.profile.companyName,
        sector: data.profile.sector,
        sticker_price: stickerDisplay?.stickerPrice,
        mos_price: stickerDisplay?.mosPrice,
        growth_rate_used: effectiveRate,
        big5_data: {
          salesGrowth: data.salesGrowth,
          epsGrowth: data.epsGrowth,
          equityGrowth: data.equityGrowth,
          fcfGrowth: data.fcfGrowth,
          roic: data.roic,
        },
      }),
    })
    if (!res.ok) {
      const err = await res.json()
      setAddError(err.error ?? 'Failed to add')
      setAdding(false)
      return
    }
    router.push('/investing/watchlist')
  }

  return (
    <div className="calculator">
      <form onSubmit={handleSubmit} className="calculator__ticker-form">
        <div className="form-field" style={{ flex: 1 }}>
          <label htmlFor="ticker">Stock ticker</label>
          <input
            id="ticker"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL"
            maxLength={10}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={isFetching || !input.trim()}>
          <Search size={15} /> {isFetching ? 'Loading…' : 'Analyze'}
        </button>
      </form>

      {error && <ErrorMessage message={(error as Error).message} />}

      {isFetching && <Spinner />}

      {data && !isFetching && (
        <>
          <div className="calculator__header">
            <div>
              <h2 className="calculator__company">{data.profile.companyName} ({ticker})</h2>
              {data.profile.sector && <p className="calculator__sector">{data.profile.sector}</p>}
            </div>
            <div className="calculator__price-info">
              <span className="stat-card__label">Current Price</span>
              <span className="calculator__price">
                {data.profile.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </span>
            </div>
          </div>

          <section>
            <h3 className="section-label">Big 5 Growth Numbers</h3>
            <Big5Table data={data} />
          </section>

          <section>
            <h3 className="section-label">Sticker Price &amp; Margin of Safety</h3>
            <div className="growth-override">
              <label className="growth-override__label">
                Growth rate used:
                <span className="growth-override__default">
                  {' '}(default {(data.effectiveGrowthRate * 100).toFixed(1)}% — min of analyst &amp; 10yr EPS)
                </span>
              </label>
              <input
                type="number"
                className="growth-override__input"
                value={growthOverride}
                onChange={(e) => setGrowthOverride(e.target.value)}
                placeholder={(data.effectiveGrowthRate * 100).toFixed(1)}
                step="0.1"
                min="0"
                max="100"
              />
              <span className="growth-override__unit">%</span>
              {growthOverride !== '' && (
                <button className="btn-secondary btn-sm" onClick={() => setGrowthOverride('')}>Reset</button>
              )}
            </div>
            {stickerDisplay && (
              <StickerPricePanel
                sticker={stickerDisplay}
                currentPrice={data.profile.price}
                growthRate={effectiveRate}
              />
            )}
          </section>

          {addError && <ErrorMessage message={addError} />}

          {isAdmin && (
            <div className="form-actions__right">
              <button className="btn-primary" onClick={addToWatchlist} disabled={adding}>
                {adding ? 'Adding…' : '+ Add to Watchlist'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
