const BASE = 'https://financialmodelingprep.com/api/v3'

async function fmpFetch<T>(path: string): Promise<T> {
  const key = process.env.FMP_API_KEY
  if (!key) throw new Error('FMP_API_KEY is not set')
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}apikey=${key}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`FMP error ${res.status} for ${path}`)
  return res.json() as Promise<T>
}

export interface FmpIncomeStatement {
  date: string
  revenue: number
  eps: number
}

export interface FmpBalanceSheet {
  date: string
  bookValuePerShare: number
}

export interface FmpCashFlow {
  date: string
  freeCashFlow: number
}

export interface FmpKeyMetrics {
  date: string
  roic: number
}

export interface FmpProfile {
  symbol: string
  companyName: string
  sector: string
  price: number
  eps: number
}

export interface FmpAnalystEstimate {
  date: string
  estimatedEpsGrowth: number
}

export interface FmpOhlc {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export async function fetchIncomeStatements(ticker: string): Promise<FmpIncomeStatement[]> {
  return fmpFetch<FmpIncomeStatement[]>(`/income-statement/${ticker.toUpperCase()}?limit=11`)
}

export async function fetchBalanceSheets(ticker: string): Promise<FmpBalanceSheet[]> {
  return fmpFetch<FmpBalanceSheet[]>(`/balance-sheet-statement/${ticker.toUpperCase()}?limit=11`)
}

export async function fetchCashFlows(ticker: string): Promise<FmpCashFlow[]> {
  return fmpFetch<FmpCashFlow[]>(`/cash-flow-statement/${ticker.toUpperCase()}?limit=11`)
}

export async function fetchKeyMetrics(ticker: string): Promise<FmpKeyMetrics[]> {
  return fmpFetch<FmpKeyMetrics[]>(`/key-metrics/${ticker.toUpperCase()}?limit=11`)
}

export async function fetchProfile(ticker: string): Promise<FmpProfile | null> {
  const data = await fmpFetch<FmpProfile[]>(`/profile/${ticker.toUpperCase()}`)
  return data[0] ?? null
}

export async function fetchAnalystEstimate(ticker: string): Promise<FmpAnalystEstimate | null> {
  const data = await fmpFetch<FmpAnalystEstimate[]>(`/analyst-estimates/${ticker.toUpperCase()}?limit=1`)
  return data[0] ?? null
}

export async function fetchPriceHistory(ticker: string): Promise<FmpOhlc[]> {
  const data = await fmpFetch<{ historical: FmpOhlc[] }>(`/historical-price-full/${ticker.toUpperCase()}`)
  return data.historical ?? []
}
