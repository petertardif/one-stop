import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import {
  fetchIncomeStatements,
  fetchBalanceSheets,
  fetchCashFlows,
  fetchKeyMetrics,
  fetchProfile,
  fetchAnalystEstimate,
  fetchPriceHistory,
} from '@/lib/fmp'
import {
  salesGrowth,
  epsGrowth,
  equityGrowth,
  fcfGrowth,
  roicRates,
  effectiveGrowthRate,
  calcSticker,
  calcMacd,
  calcStochastic,
  calcSma10,
} from '@/lib/indicators'

export async function GET(
  req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ticker = params.ticker.toUpperCase()
  const data = new URL(req.url).searchParams.get('data') ?? 'big5'

  try {
    if (data === 'price') {
      const yahooRes = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      if (!yahooRes.ok) return NextResponse.json({ error: 'Price not found' }, { status: 404 })
      const yahooJson = await yahooRes.json()
      const meta = yahooJson?.chart?.result?.[0]?.meta
      if (!meta?.regularMarketPrice) return NextResponse.json({ error: 'Price not found' }, { status: 404 })
      return NextResponse.json({
        ticker,
        price: meta.regularMarketPrice as number,
        companyName: (meta.longName ?? meta.shortName ?? ticker) as string,
      })
    }

    if (data === 'indicators') {
      const history = await fetchPriceHistory(ticker)
      return NextResponse.json({
        macd: calcMacd(history),
        stoch: calcStochastic(history),
        sma: calcSma10(history),
      })
    }

    // big5 (default)
    const [income, balance, cashflow, metrics, profile, analyst] = await Promise.all([
      fetchIncomeStatements(ticker),
      fetchBalanceSheets(ticker),
      fetchCashFlows(ticker),
      fetchKeyMetrics(ticker),
      fetchProfile(ticker),
      fetchAnalystEstimate(ticker),
    ])

    if (!profile) return NextResponse.json({ error: 'Ticker not found' }, { status: 404 })

    const eps = epsGrowth(income)
    const analystRate = analyst?.estimatedEpsGrowth ?? null
    const growthRate = effectiveGrowthRate(eps, analystRate)

    return NextResponse.json({
      profile,
      salesGrowth: salesGrowth(income),
      epsGrowth: eps,
      equityGrowth: equityGrowth(balance),
      fcfGrowth: fcfGrowth(cashflow),
      roic: roicRates(metrics),
      analystGrowthRate: analystRate,
      effectiveGrowthRate: growthRate,
      sticker: calcSticker(profile.eps, growthRate),
      currentEps: profile.eps,
      currentPrice: profile.price,
    })
  } catch (err) {
    console.error('FMP error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch data' },
      { status: 502 }
    )
  }
}
