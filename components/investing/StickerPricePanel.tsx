import type { StickerResult } from '@/lib/indicators'

function fmt(v: number) {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

interface Props {
  sticker: StickerResult
  currentPrice?: number | null
  growthRate: number
}

export function StickerPricePanel({ sticker, currentPrice, growthRate }: Props) {
  const aboveMos = currentPrice !== null && currentPrice !== undefined && currentPrice <= sticker.mosPrice
  const aboveSticker = currentPrice !== null && currentPrice !== undefined && currentPrice <= sticker.stickerPrice

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
      <div className={`stat-card sticker-panel__mos ${aboveMos ? 'stat-card--positive-bg' : ''}`}>
        <span className="stat-card__label">Margin of Safety (50%)</span>
        <span className={`stat-card__value ${aboveMos ? 'stat-card--positive' : 'stat-card--negative'}`}>
          {fmt(sticker.mosPrice)}
        </span>
        {currentPrice !== null && currentPrice !== undefined && (
          <span className="sticker-panel__price-cmp">
            Current: {fmt(currentPrice)} —{' '}
            {aboveMos ? '✓ Buy zone' : aboveSticker ? 'Watch zone' : 'Above sticker'}
          </span>
        )}
      </div>
    </div>
  )
}
