-- Big 5 financials from SEC EDGAR (data.sec.gov companyfacts), replacing FMP's
-- statement endpoints (legacy /api/v3 is closed to new keys and the free /stable
-- plan caps history at 5 years). One normalized row per company per fiscal year,
-- refreshed when older than 30 days or on demand. See lib/sec.ts.

-- Ticker -> CIK map, cached from https://www.sec.gov/files/company_tickers.json
CREATE TABLE sec_companies (
  ticker     TEXT PRIMARY KEY,
  cik        TEXT NOT NULL,          -- 10-digit, zero-padded
  name       TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sec_companies_cik_idx ON sec_companies (cik);

-- Annual (10-K) values; fiscal_year = calendar year of the period end.
CREATE TABLE sec_annual_financials (
  cik                 TEXT NOT NULL,
  fiscal_year         INT  NOT NULL,
  period_end          DATE NOT NULL,
  revenue             NUMERIC,
  eps_diluted         NUMERIC,
  equity              NUMERIC,
  shares_outstanding  NUMERIC,
  operating_cash_flow NUMERIC,
  capex               NUMERIC,
  operating_income    NUMERIC,
  income_tax          NUMERIC,
  pretax_income       NUMERIC,
  long_term_debt      NUMERIC,
  short_term_debt     NUMERIC,
  cash                NUMERIC,
  accession           TEXT,
  fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cik, fiscal_year)
);
