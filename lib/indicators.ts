import type {
  FmpIncomeStatement,
  FmpBalanceSheet,
  FmpCashFlow,
  FmpKeyMetrics,
  FmpOhlc,
} from './fmp'

export interface GrowthRates {
  y1: number | null
  y5: number | null
  y10: number | null
}

export interface StickerResult {
  futureEPS: number
  defaultPE: number
  futurePrice: number
  stickerPrice: number
  mosPrice: number
}

export interface MacdPoint {
  date: string
  macd: number
  signal: number
  histogram: number
}

export interface StochPoint {
  date: string
  k: number
  d: number
}

export interface SmaPoint {
  date: string
  price: number
  sma10: number | null
  aboveSma: boolean
}

// --- Helpers ---

export function cagr(latest: number, oldest: number, years: number): number | null {
  if (!oldest || oldest <= 0 || !latest || years <= 0) return null
  return Math.pow(latest / oldest, 1 / years) - 1
}

function growthRates(values: number[]): GrowthRates {
  // values[0] = newest, values[n-1] = oldest
  const latest = values[0]
  return {
    y1: values.length > 1 ? cagr(latest, values[1], 1) : null,
    y5: values.length > 5 ? cagr(latest, values[5], 5) : null,
    y10: values.length > 10 ? cagr(latest, values[10], 10) : null,
  }
}

// --- Big 5 ---

export function salesGrowth(statements: FmpIncomeStatement[]): GrowthRates {
  return growthRates(statements.map((s) => s.revenue))
}

export function epsGrowth(statements: FmpIncomeStatement[]): GrowthRates {
  return growthRates(statements.map((s) => s.eps))
}

export function equityGrowth(sheets: FmpBalanceSheet[]): GrowthRates {
  return growthRates(sheets.map((s) => s.bookValuePerShare))
}

export function fcfGrowth(flows: FmpCashFlow[]): GrowthRates {
  return growthRates(flows.map((f) => f.freeCashFlow))
}

export function latestRoic(metrics: FmpKeyMetrics[]): number | null {
  return metrics[0]?.roic ?? null
}

export function effectiveGrowthRate(
  eps: GrowthRates,
  analystEstimate: number | null
): number {
  const historical = eps.y10 ?? eps.y5 ?? eps.y1 ?? 0
  const analyst = analystEstimate ?? Infinity
  return Math.max(0, Math.min(historical, analyst))
}

// --- Sticker Price ---

export function calcSticker(currentEPS: number, growthRate: number): StickerResult {
  const futureEPS = currentEPS * Math.pow(1 + growthRate, 10)
  const defaultPE = Math.min(2 * growthRate * 100, 50)
  const futurePrice = futureEPS * defaultPE
  const stickerPrice = futurePrice / Math.pow(1.15, 10)
  const mosPrice = stickerPrice * 0.5
  return { futureEPS, defaultPE, futurePrice, stickerPrice, mosPrice }
}

// --- EMA helper (private) ---

function ema(values: number[], period: number): number[] {
  if (values.length < period) return []
  const k = 2 / (period + 1)
  const result: number[] = []
  // Seed with SMA of first `period` values
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  result.push(prev)
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    result.push(prev)
  }
  return result
}

// --- MACD ---

export function calcMacd(prices: FmpOhlc[]): MacdPoint[] {
  // prices newest-first → reverse to oldest-first for EMA calculation
  const ordered = [...prices].reverse()
  const closes = ordered.map((p) => p.close)

  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)

  // MACD line: align by offset — ema26 starts at index 25, ema12 at index 11
  const offset = 26 - 12 // ema12 has 14 more values
  const macdLine: number[] = []
  for (let i = 0; i < ema26.length; i++) {
    macdLine.push(ema12[i + offset] - ema26[i])
  }

  const signalLine = ema(macdLine, 9)
  const signalOffset = 9 - 1

  const result: MacdPoint[] = []
  for (let i = 0; i < signalLine.length; i++) {
    const macd = macdLine[i + signalOffset]
    const signal = signalLine[i]
    // Map back to original ordered array index
    const priceIdx = 25 + i + signalOffset
    if (priceIdx >= ordered.length) break
    result.push({
      date: ordered[priceIdx].date,
      macd,
      signal,
      histogram: macd - signal,
    })
  }

  return result
}

// --- Stochastic ---

function sma(values: number[], period: number): (number | null)[] {
  return values.map((_, i) =>
    i < period - 1
      ? null
      : values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
  )
}

export function calcStochastic(prices: FmpOhlc[]): StochPoint[] {
  const ordered = [...prices].reverse()
  const period = 14
  const result: StochPoint[] = []

  const kValues: (number | null)[] = ordered.map((_, i) => {
    if (i < period - 1) return null
    const window = ordered.slice(i - period + 1, i + 1)
    const high = Math.max(...window.map((p) => p.high))
    const low = Math.min(...window.map((p) => p.low))
    if (high === low) return 50
    return ((ordered[i].close - low) / (high - low)) * 100
  })

  const validK = kValues.filter((v): v is number => v !== null)
  const dValues = sma(validK, 3)

  const kStart = period - 1
  for (let i = 0; i < dValues.length; i++) {
    const d = dValues[i]
    if (d === null) continue
    const k = validK[i]
    result.push({ date: ordered[kStart + i].date, k, d })
  }

  return result
}

// --- 10-day SMA ---

export function calcSma10(prices: FmpOhlc[]): SmaPoint[] {
  const ordered = [...prices].reverse()
  const period = 10
  return ordered.map((p, i) => {
    if (i < period - 1) {
      return { date: p.date, price: p.close, sma10: null, aboveSma: false }
    }
    const sma10 = ordered.slice(i - period + 1, i + 1).reduce((a, b) => a + b.close, 0) / period
    return { date: p.date, price: p.close, sma10, aboveSma: p.close >= sma10 }
  })
}
