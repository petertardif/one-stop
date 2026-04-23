interface Props {
  price: number | null
  stickerPrice: number | null
  mosPrice: number | null
}

export function StatusBadge({ price, stickerPrice, mosPrice }: Props) {
  if (price === null || stickerPrice === null || mosPrice === null) {
    return <span className="status-badge status-badge--hold">—</span>
  }
  if (price <= mosPrice) return <span className="status-badge status-badge--buy">Buy</span>
  if (price <= stickerPrice) return <span className="status-badge status-badge--watch">Watch</span>
  return <span className="status-badge status-badge--hold">Hold</span>
}
