// Display money as $1,234.56 / -$1,234.56 (sign leads the currency symbol).
export function money(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${n < 0 ? '-' : ''}$${abs}`
}
