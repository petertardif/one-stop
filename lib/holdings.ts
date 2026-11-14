import { z } from 'zod'

export const TICKER_RE = /^[A-Z][A-Z.\-]{0,9}$/

export const lotSchema = z.object({
  ticker: z.string().trim().transform((v) => v.toUpperCase()).pipe(z.string().regex(TICKER_RE)),
  company_name: z.string().trim().min(1).max(200),
  shares: z.coerce.number().positive(),
  price: z.coerce.number().min(0),
  bought_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export interface HoldingLot {
  id: string
  ticker: string
  company_name: string
  shares: string
  price: string
  bought_on: string
  notes: string | null
  sold_on: string | null
  sale_price: string | null
}

export const LOT_COLUMNS = `id, ticker, company_name, shares, price, to_char(bought_on, 'YYYY-MM-DD') AS bought_on, notes,
  to_char(sold_on, 'YYYY-MM-DD') AS sold_on, sale_price`

export const sellSchema = z.object({
  ticker: z.string().trim().transform((v) => v.toUpperCase()).pipe(z.string().regex(TICKER_RE)),
  shares: z.coerce.number().positive(),
  price: z.coerce.number().min(0),
  sold_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/** Shares are NUMERIC(18,6); do sale arithmetic in whole micro-shares to avoid float drift. */
export const toMicro = (v: number | string) => Math.round(Number(v) * 1e6)
export const fromMicro = (v: number) => (v / 1e6).toFixed(6)
