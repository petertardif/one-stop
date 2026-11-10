// Display money as $1,234.56 / -$1,234.56 (sign leads the currency symbol).
export function money(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${n < 0 ? '-' : ''}$${abs}`
}

// Cash-register money formatting: treat the raw digits as cents so the decimal
// point is inserted automatically. '5' → '0.05', '1234' → '12.34'.
export function formatMoneyCents(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return ''
  return (parseInt(digits, 10) / 100).toFixed(2)
}
