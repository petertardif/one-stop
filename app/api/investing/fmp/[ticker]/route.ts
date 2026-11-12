import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { fetchProfile, fetchAnalystEstimates, fetchPriceHistory } from '@/lib/fmp'
import { getSecFinancials, NoSecDataError } from '@/lib/sec'
import {
  salesGrowth,
  epsGrowth,
  equityGrowth,
  fcfGrowth,
  roicRates,
  effectiveGrowthRate,
  calcSticker,
  cagr,
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
  if (!/^[A-Z][A-Z.\-]{0,9}$/.test(ticker)) {
    return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 })
  }
  const searchParams = new URL(req.url).searchParams
  const data = searchParams.get('data') ?? 'big5'

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

    // big5 (default): annual financials from SEC EDGAR (cached in the DB),
    // name/sector/price and analyst estimates from FMP.
    const [sec, profile, estimates] = await Promise.all([
      getSecFinancials(ticker, { force: searchParams.get('refresh') === '1' }),
      fetchProfile(ticker),
      fetchAnalystEstimates(ticker).catch(() => []),
    ])
    const latest = sec.rows.find((r) => r.eps_diluted != null)
    const currentEps = latest?.eps_diluted ?? 0

    // Analyst growth = CAGR from the latest reported EPS to the furthest-out
    // annual EPS estimate (FMP's /stable no longer returns a growth figure).
    let analystRate: number | null = null
    if (latest) {
      const future = estimates.filter((e) => e.epsAvg != null && Number(e.date.slice(0, 4)) > latest.fiscal_year)
      const last = future[future.length - 1]
      if (last) analystRate = cagr(last.epsAvg as number, currentEps, Number(last.date.slice(0, 4)) - latest.fiscal_year)
    }

    const eps = epsGrowth(sec.rows)
    const growthRate = effectiveGrowthRate(eps, analystRate)

    return NextResponse.json({
      profile: {
        companyName: profile?.companyName ?? sec.name ?? ticker,
        sector: profile?.sector ?? null,
        price: profile?.price ?? null,
        eps: currentEps,
      },
      salesGrowth: salesGrowth(sec.rows),
      epsGrowth: eps,
      equityGrowth: equityGrowth(sec.rows),
      fcfGrowth: fcfGrowth(sec.rows),
      roic: roicRates(sec.rows),
      analystGrowthRate: analystRate,
      effectiveGrowthRate: growthRate,
      sticker: calcSticker(currentEps, growthRate),
      currentEps,
      currentPrice: profile?.price ?? null,
      source: 'SEC EDGAR',
      latestFiscalYear: latest?.fiscal_year ?? null,
      fetchedAt: sec.fetchedAt,
    })
  } catch (err) {
    if (err instanceof NoSecDataError) return NextResponse.json({ error: err.message }, { status: 404 })
    console.error('Big 5 data error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch data' },
      { status: 502 }
    )
  }
}
