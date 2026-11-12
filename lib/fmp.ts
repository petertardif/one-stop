// Financial Modeling Prep, free plan, /stable endpoints. Used only for market
// data: company profile (name, sector, price), analyst EPS estimates and daily
// price history. Annual financials for the Big 5 come from SEC EDGAR (lib/sec.ts):
// the legacy /api/v3 endpoints are closed to keys created after Aug 31 2025, and
// the free /stable statement endpoints cap history at 5 years.

const BASE = 'https://financialmodelingprep.com/stable'

async function fmpFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.FMP_API_KEY
  if (!key) throw new Error('FMP_API_KEY is not set')
  const qs = new URLSearchParams({ ...params, apikey: key })
  const res = await fetch(`${BASE}/${path}?${qs}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`FMP error ${res.status} for ${path}`)
  const json: unknown = await res.json()
  // FMP reports plan/endpoint problems as a 200 with an "Error Message" body.
  if (json && typeof json === 'object' && !Array.isArray(json) && 'Error Message' in json) {
    throw new Error(`FMP: ${String((json as Record<string, unknown>)['Error Message']).slice(0, 160)}`)
  }
  return json as T
}

export interface FmpProfile {
  symbol: string
  companyName: string
  sector: string | null
  price: number
}

export interface FmpAnalystEstimate {
  date: string
  epsAvg: number | null
}

export interface FmpOhlc {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export async function fetchProfile(ticker: string): Promise<FmpProfile | null> {
  const data = await fmpFetch<FmpProfile[]>('profile', { symbol: ticker.toUpperCase() })
  return data[0] ?? null
}

/** Annual EPS estimates, oldest first. */
export async function fetchAnalystEstimates(ticker: string): Promise<FmpAnalystEstimate[]> {
  const data = await fmpFetch<FmpAnalystEstimate[]>('analyst-estimates', {
    symbol: ticker.toUpperCase(), period: 'annual', limit: '10',
  })
  return [...data].sort((a, b) => a.date.localeCompare(b.date))
}

/** Daily OHLC, newest first (same order the old /historical-price-full returned). */
export async function fetchPriceHistory(ticker: string): Promise<FmpOhlc[]> {
  const data = await fmpFetch<FmpOhlc[]>('historical-price-eod/full', { symbol: ticker.toUpperCase() })
  return [...data].sort((a, b) => b.date.localeCompare(a.date))
}
