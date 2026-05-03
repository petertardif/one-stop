import type { StickerResult } from '@/lib/indicators'

function fmt(v: number) {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

interface Props {
  sticker: StickerResult
  currentPrice?: number | null
  growthRate: number
}

function getZone(currentPrice: number, mosPrice: number, stickerPrice: number): 'buy' | 'watch' | 'hold' {
  if (currentPrice <= mosPrice) return 'buy'
  if (currentPrice <= stickerPrice) return 'watch'
  return 'hold'
}

export function StickerPricePanel({ sticker, currentPrice, growthRate }: Props) {
  const hasPrice = currentPrice !== null && currentPrice !== undefined
  const zone = hasPrice ? getZone(currentPrice!, sticker.mosPrice, sticker.stickerPrice) : null

  return (
    <div className="sticker-panel">
      <div className="stat-card">
        <span className="stat-card__label">Growth Rate Used</span>
        <span className="stat-card__value">{(growthRate * 100).toFixed(1)}%</span>
      </div>
      <div className="stat-card">
        <span className="stat-card__label">Default P/E</span>
        <span className="stat-card__value">{sticker.defaultPE.toFixed(1)}×</span>
      </div>
      <div className="stat-card">
        <span className="stat-card__label">Future EPS (10yr)</span>
        <span className="stat-card__value">{fmt(sticker.futureEPS)}</span>
      </div>
      <div className="stat-card">
        <span className="stat-card__label">Future Price (10yr)</span>
        <span className="stat-card__value">{fmt(sticker.futurePrice)}</span>
      </div>
      <div className="stat-card">
        <span className="stat-card__label">Sticker Price</span>
        <span className="stat-card__value">{fmt(sticker.stickerPrice)}</span>
      </div>
      <div className="stat-card">
        <span className="stat-card__label">Margin of Safety (50%)</span>
        <span className="stat-card__value">{fmt(sticker.mosPrice)}</span>
      </div>
      {hasPrice && zone && (
        <div className="stat-card sticker-panel__status-card">
          <div className="sticker-panel__status-row">
            <span className="sticker-panel__current-price">{fmt(currentPrice!)}</span>
            <span className={`status-badge status-badge--${zone}`}>
              {zone === 'buy' ? 'Buy' : zone === 'watch' ? 'Watch' : 'Hold'}
            </span>
          </div>
          <div className="sticker-panel__zone-ref">
            <span className="sticker-panel__zone-ref--buy">Buy ≤ {fmt(sticker.mosPrice)}</span>
            <span className="sticker-panel__zone-ref--sep">·</span>
            <span className="sticker-panel__zone-ref--watch">Watch ≤ {fmt(sticker.stickerPrice)}</span>
            <span className="sticker-panel__zone-ref--sep">·</span>
            <span className="sticker-panel__zone-ref--hold">Hold above</span>
          </div>
        </div>
      )}
    </div>
  )
}
