import { pool, query } from '@/lib/db'

// SEC EDGAR client for the Big 5 calculator. Annual 10-K figures come from the
// free XBRL "companyfacts" API, are normalized to one row per fiscal year, and are
// cached in sec_annual_financials (refetched after 30 days or on demand).
// The SEC requires a User-Agent with a contact email and <= 10 requests/second.

const STALE_MS = 30 * 24 * 60 * 60 * 1000

export class NoSecDataError extends Error {
  constructor(ticker: string) {
    super(`No SEC data for ${ticker} (US filers only)`)
    this.name = 'NoSecDataError'
  }
}

export interface SecAnnual {
  fiscal_year: number
  period_end: string
  revenue: number | null
  eps_diluted: number | null
  equity: number | null
  shares_outstanding: number | null
  operating_cash_flow: number | null
  capex: number | null
  operating_income: number | null
  income_tax: number | null
  pretax_income: number | null
  long_term_debt: number | null
  short_term_debt: number | null
  cash: number | null
}

export interface SecFinancials {
  cik: string
  name: string | null
  rows: SecAnnual[] // newest first
  fetchedAt: string
}

type Field = Exclude<keyof SecAnnual, 'fiscal_year' | 'period_end'>
type NormalizedRow = SecAnnual & { accession: string | null }

const FIELDS: Field[] = [
  'revenue', 'eps_diluted', 'equity', 'shares_outstanding', 'operating_cash_flow', 'capex',
  'operating_income', 'income_tax', 'pretax_income', 'long_term_debt', 'short_term_debt', 'cash',
]

async function secFetch<T>(url: string): Promise<T> {
  const email = process.env.SEC_CONTACT_EMAIL
  if (!email) throw new Error('SEC_CONTACT_EMAIL is not set')
  const res = await fetch(url, { headers: { 'User-Agent': `One Stop ${email}` }, cache: 'no-store' })
  if (!res.ok) throw new Error(`SEC error ${res.status} for ${url}`)
  return res.json() as Promise<T>
}

async function resolveCik(ticker: string): Promise<{ cik: string; name: string | null } | null> {
  const hit = await query<{ cik: string; name: string | null }>(
    'SELECT cik, name FROM sec_companies WHERE ticker = $1', [ticker]
  )
  if (hit.rows[0]) return hit.rows[0]

  const map = await secFetch<Record<string, { cik_str: number; ticker: string; title: string }>>(
    'https://www.sec.gov/files/company_tickers.json'
  )
  const entries = Object.values(map).map((e) => ({
    ticker: e.ticker.toUpperCase(), cik: String(e.cik_str).padStart(10, '0'), name: e.title,
  }))
  // One multi-row upsert: refreshes the whole map whenever an unknown ticker shows up.
  await query(
    `INSERT INTO sec_companies (ticker, cik, name)
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[])
     ON CONFLICT (ticker) DO UPDATE SET cik = EXCLUDED.cik, name = EXCLUDED.name, fetched_at = NOW()`,
    [entries.map((e) => e.ticker), entries.map((e) => e.cik), entries.map((e) => e.name)]
  )
  const match = entries.find((e) => e.ticker === ticker)
  return match ? { cik: match.cik, name: match.name } : null
}

interface Fact { start?: string; end: string; val: number; accn: string; form: string; filed: string }
interface CompanyFacts {
  entityName?: string
  facts: Record<string, Record<string, { units: Record<string, Fact[]> }>>
}

// First tag with a value for a given year wins; companies switch tags over time.
const FLOW_TAGS: Partial<Record<Field, string[]>> = {
  revenue: [
    'RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet',
    'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueGoodsNet',
  ],
  eps_diluted: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'],
  operating_cash_flow: [
    'NetCashProvidedByUsedInOperatingActivities',
    'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  ],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  // Fallback only: used when no year-end share count (instant) is tagged, e.g. KO.
  shares_outstanding: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
  operating_income: ['OperatingIncomeLoss'],
  income_tax: ['IncomeTaxExpenseBenefit'],
  pretax_income: [
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  ],
}
const INSTANT_TAGS: Partial<Record<Field, string[]>> = {
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  shares_outstanding: ['CommonStockSharesOutstanding'],
  long_term_debt: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  short_term_debt: ['LongTermDebtCurrent', 'DebtCurrent'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
}

const isAnnualForm = (f: Fact) => f.form === '10-K' || f.form === '10-K/A'
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000

// One tag's annual values keyed by period end. Each 10-K repeats prior years as
// comparatives, so several facts share an end date: the latest filing wins
// (which also picks up restatements).
function byEnd(facts: CompanyFacts, tag: string, flow: boolean): Map<string, Fact> {
  const units = facts.facts['us-gaap']?.[tag]?.units
  const out = new Map<string, Fact>()
  if (!units) return out
  for (const list of Object.values(units)) {
    for (const f of list) {
      if (!isAnnualForm(f)) continue
      const isFlowYear = !!f.start && Math.abs(daysBetween(f.start, f.end) - 365) <= 15
      if (flow ? !isFlowYear : !!f.start) continue
      const prev = out.get(f.end)
      if (!prev || f.filed > prev.filed) out.set(f.end, f)
    }
  }
  return out
}

function tagMaps(facts: CompanyFacts, tags: Partial<Record<Field, string[]>>, flow: boolean) {
  const out = new Map<Field, Map<string, Fact>[]>()
  for (const field of FIELDS) {
    const list = tags[field]
    if (list) out.set(field, list.map((t) => byEnd(facts, t, flow)))
  }
  return out
}

// Snap a ratio to a stock-split ratio (n:1 or 1:n, plus 3:2 / 2:3); anything
// that isn't close to one is restatement noise, treated as no split.
function snapSplit(r: number): number {
  if (!isFinite(r) || r <= 0) return 1
  const candidates = [1.5, 2 / 3]
  for (let n = 2; n <= 50; n++) candidates.push(n, 1 / n)
  for (const c of candidates) if (Math.abs(r / c - 1) < 0.04) return c
  return 1
}

/**
 * Stock-split factors per fiscal-year end, relative to the newest year. Old 10-Ks
 * report EPS on the pre-split share basis and later filings don't always restate
 * every year, so walk newest -> oldest: each 10-K reports two or three years side
 * by side on one basis, so comparing a year's latest value with the value an older
 * filing gave for it reveals any split in between. EPS × factor and shares ÷ factor
 * puts every year on today's basis.
 */
function splitFactors(facts: CompanyFacts, ends: string[]): Map<string, number> {
  const tags = FLOW_TAGS.eps_diluted ?? []
  // end -> accession -> EPS value (first matching tag per filing)
  const byFiling = new Map<string, Map<string, { val: number; filed: string }>>()
  for (const tag of tags) {
    for (const list of Object.values(facts.facts['us-gaap']?.[tag]?.units ?? {})) {
      for (const f of list) {
        if (!isAnnualForm(f) || !f.start || Math.abs(daysBetween(f.start, f.end) - 365) > 15) continue
        const m = byFiling.get(f.end) ?? new Map<string, { val: number; filed: string }>()
        if (!m.has(f.accn)) m.set(f.accn, { val: f.val, filed: f.filed })
        byFiling.set(f.end, m)
      }
    }
  }
  const latestVal = (end: string) => {
    let best: { val: number; filed: string } | null = null
    byFiling.get(end)?.forEach((v) => { if (!best || v.filed > best.filed) best = v })
    return best as { val: number; filed: string } | null
  }

  const sorted = ends.filter((e) => byFiling.has(e)).sort().reverse()
  const factor = new Map<string, number>()
  if (!sorted.length) return factor
  factor.set(sorted[0], 1)
  for (let i = 1; i < sorted.length; i++) {
    const newer = sorted[i - 1], older = sorted[i]
    const prev = factor.get(newer) ?? 1
    // Newest filing that reports both years: its older-year value is on the same
    // basis as its newer-year value, so it bridges the two.
    let bridge: string | null = null, bridgeFiled = ''
    byFiling.get(older)?.forEach((v, accn) => {
      if (byFiling.get(newer)?.has(accn) && v.filed > bridgeFiled) { bridge = accn; bridgeFiled = v.filed }
    })
    const newerLatest = latestVal(newer), olderLatest = latestVal(older)
    let step = 1
    if (bridge && newerLatest && olderLatest) {
      const newerInBridge = byFiling.get(newer)!.get(bridge)!.val
      const olderInBridge = byFiling.get(older)!.get(bridge)!.val
      // basis change between the bridge filing and the newer year's latest filing...
      const a = newerInBridge !== 0 ? snapSplit(newerLatest.val / newerInBridge) : 1
      // ...and between the bridge and the older year's own latest filing.
      const b = olderLatest.val !== 0 ? snapSplit(olderInBridge / olderLatest.val) : 1
      step = a * b
    }
    factor.set(older, prev * step)
  }
  return factor
}

export function normalizeAnnual(facts: CompanyFacts): NormalizedRow[] {
  const flow = tagMaps(facts, FLOW_TAGS, true)
  const inst = tagMaps(facts, INSTANT_TAGS, false)

  // Fiscal-year ends = period ends of annual revenue / EPS / operating cash flow.
  const ends = new Set<string>()
  for (const field of ['revenue', 'eps_diluted', 'operating_cash_flow'] as Field[]) {
    for (const m of flow.get(field) ?? []) m.forEach((_, end) => ends.add(end))
  }

  const pick = (maps: Map<string, Fact>[] | undefined, end: string): Fact | null => {
    for (const m of maps ?? []) {
      const f = m.get(end)
      if (f) return f
    }
    return null
  }

  const split = splitFactors(facts, Array.from(ends))

  const rows = new Map<number, NormalizedRow>()
  for (const end of Array.from(ends).sort()) {
    const row: NormalizedRow = {
      fiscal_year: Number(end.slice(0, 4)), period_end: end, accession: null,
      revenue: null, eps_diluted: null, equity: null, shares_outstanding: null,
      operating_cash_flow: null, capex: null, operating_income: null, income_tax: null,
      pretax_income: null, long_term_debt: null, short_term_debt: null, cash: null,
    }
    for (const field of FIELDS) {
      const f = field === 'shares_outstanding'
        ? pick(inst.get(field), end) ?? pick(flow.get(field), end)
        : pick(flow.get(field), end) ?? pick(inst.get(field), end)
      if (!f) continue
      row[field] = f.val
      if (!row.accession && flow.has(field)) row.accession = f.accn
    }
    // Restate per-share values onto today's share basis (see splitFactors).
    const k = split.get(end) ?? 1
    if (row.eps_diluted != null) row.eps_diluted *= k
    if (row.shares_outstanding != null) row.shares_outstanding /= k
    // A later period end in the same calendar year wins (fiscal-year change).
    rows.set(row.fiscal_year, row)
  }
  return Array.from(rows.values())
}

const num = (v: string | null) => (v == null ? null : parseFloat(v))

type StoredRow = { [K in Field]: string | null } & { fiscal_year: number; period_end: string; fetched_at: Date }

async function readStored(cik: string) {
  const r = await query<StoredRow>(
    `SELECT fiscal_year, to_char(period_end, 'YYYY-MM-DD') AS period_end, fetched_at, ${FIELDS.join(', ')}
     FROM sec_annual_financials WHERE cik = $1 ORDER BY fiscal_year DESC`,
    [cik]
  )
  const rows: SecAnnual[] = r.rows.map((x) => {
    const row = { fiscal_year: x.fiscal_year, period_end: x.period_end } as SecAnnual
    for (const field of FIELDS) row[field] = num(x[field])
    return row
  })
  const fetchedAt = r.rows.reduce<Date | null>((m, x) => (!m || x.fetched_at < m ? x.fetched_at : m), null)
  return { rows, fetchedAt }
}

export async function getSecFinancials(ticker: string, { force = false } = {}): Promise<SecFinancials> {
  const company = await resolveCik(ticker)
  if (!company) throw new NoSecDataError(ticker)

  const stored = await readStored(company.cik)
  if (!force && stored.rows.length && stored.fetchedAt && Date.now() - stored.fetchedAt.getTime() < STALE_MS) {
    return { cik: company.cik, name: company.name, rows: stored.rows, fetchedAt: stored.fetchedAt.toISOString() }
  }

  let facts: CompanyFacts
  try {
    facts = await secFetch<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${company.cik}.json`)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('SEC error 404')) throw new NoSecDataError(ticker)
    throw err
  }
  const annual = normalizeAnnual(facts)
  if (!annual.length) throw new NoSecDataError(ticker)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM sec_annual_financials WHERE cik = $1', [company.cik])
    const placeholders = FIELDS.map((_, i) => `$${i + 5}`).join(', ')
    for (const row of annual) {
      await client.query(
        `INSERT INTO sec_annual_financials (cik, fiscal_year, period_end, accession, ${FIELDS.join(', ')})
         VALUES ($1, $2, $3, $4, ${placeholders})`,
        [company.cik, row.fiscal_year, row.period_end, row.accession, ...FIELDS.map((f) => row[f])]
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  const saved = await readStored(company.cik)
  return {
    cik: company.cik,
    name: company.name ?? facts.entityName ?? null,
    rows: saved.rows,
    fetchedAt: new Date().toISOString(),
  }
}
