'use client'

import { useQuery } from '@tanstack/react-query'
import { MacdChart } from '@/components/investing/MacdChart'
import { StochasticChart } from '@/components/investing/StochasticChart'
import { SmaChart } from '@/components/investing/SmaChart'
import { Spinner } from '@/components/Spinner'
import { InvestingError } from '@/components/investing/InvestingError'
import type { MacdPoint, StochPoint, SmaPoint } from '@/lib/indicators'

interface IndicatorsResponse {
  macd: MacdPoint[]
  stoch: StochPoint[]
  sma: SmaPoint[]
}

export function TechnicalPanel({ ticker }: { ticker: string }) {
  const { data, isLoading, error } = useQuery<IndicatorsResponse>({
    queryKey: ['indicators', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/investing/fmp/${ticker}?data=indicators`)
      if (!res.ok) throw new Error('Failed to load indicators')
      return res.json()
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  if (isLoading) return <Spinner />
  if (error) return <InvestingError message="Failed to load technical indicators." detail={(error as Error).message} />
  if (!data) return null

  return (
    <div className="indicators-section">
      <MacdChart data={data.macd} />
      <StochasticChart data={data.stoch} />
      <SmaChart data={data.sma} />
    </div>
  )
}
