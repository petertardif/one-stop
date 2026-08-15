// "Paid With" is a short-term-debt concept: the column isn't shown on the Long Term
// tab, so a long-term debt is always stored as N/A. Enforcing it server-side (rather
// than only hiding the input) means a debt switched to long loses a stale value, and
// reads as N/A if it later lands on the Paid Off tab.
export const paidWithFor = (term: 'short' | 'long', value?: string | null): string | null =>
  term === 'long' ? null : value ?? null
