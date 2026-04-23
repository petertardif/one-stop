# One Stop — App Specification

## Context

"One Stop" is a private, family-focused financial hub built on an existing Next.js 14 + PostgreSQL scaffold. The goal is to consolidate everything related to the family's financial life into a single trusted app: live account balances, investing research, and a contingency guide for the partner. The app needs three distinct user roles (admin, partner, and dependent), manual data entry plus optional Plaid bank sync, and three core feature areas.

---

## User Roles

| Role | Access |
|------|--------|
| **Admin** (primary user) | Full read/write across all sections |
| **Partner** | Read-only on Dashboard & "In Case I Die"; access to investing research by default (configurable); some write access for specific sections (configurable) |
| **Dependent** | Read-only on Dashboard & "In Case I Die"; access to investing research by default (configurable); some write access for specific sections (configurable) |

Authentication: email + password, JWT sessions via NextAuth.js. Role is stored on the user record in the database.

---

## Core Modules

### 1. Authentication (`/app/(auth)`)

- Sign-in page (`/login`)
- Invite-only registration (admin sends invite link to partner or dependent)
- No public sign-up
- Session stored in HTTP-only cookie via NextAuth
- Middleware (`middleware.ts`) protects all routes; redirects unauthenticated users to `/login`

---

### 2. Financial Dashboard (`/app/dashboard`)

The primary landing page after login. Provides an at-a-glance view of the family's complete financial picture.

**Sections:**

#### Net Worth Summary
- Total assets vs. total liabilities → net worth
- Trend chart (monthly net worth over rolling 12 months)

#### Accounts Panel
- List of all financial accounts grouped by type:
  - Checking / Savings
  - Investment / Brokerage
  - Retirement (401k, IRA, Roth IRA)
  - Real Estate
  - Debt (mortgage, car loans, credit cards, student loans)
- Each account shows: institution name, account nickname, current balance, last updated timestamp
- Manual balance update button on each account
- Optional: "Sync" button for Plaid-connected accounts

#### Monthly Cash Flow
- Income vs. expenses for current month
- Manual entry of income/expense categories
- Simple bar chart (income bar vs. expense bar)

#### Debt Snapshot
- Total debt balance
- List of debts with balance, interest rate, minimum payment
- Payoff order suggestion (avalanche or snowball)

**Data Entry:**
- `/dashboard/accounts/new` — add a new account (manual or Plaid-linked)
- `/dashboard/accounts/[id]/edit` — edit account details or update balance
- `/dashboard/transactions/new` — log an income or expense entry

**Plaid Integration (optional per account):**
- "Connect to bank" flow using Plaid Link widget
- Plaid access tokens stored server-side (never exposed to client)
- Background sync job or manual "sync now" button refreshes balances

---

### 3. Monthly Budget / Ledger (`/app/monthly`)

A full transaction ledger showing credits and debits from the family's checking account and credit cards. Transactions are pulled from Plaid-connected accounts and stored locally. Manual entries (not tied to any bank account) can also be added.

**Period selector** — toggleable filter:
- All time
- Individual year (dynamically generated from existing data)
- Last 6 months
- Last 3 months
- Individual month (with prev/next navigation)

**Account filter** — tabs for All / Checking / each credit card account.

**Transaction table columns:**

| Column | Notes |
|--------|-------|
| Date | Editable date picker |
| ✓ | Posted indicator (checkbox) |
| Check # | Optional, for paper checks |
| Category | Dropdown (predefined family categories) |
| Description | Editable text |
| Amount | Positive = credit (green), negative = debit (red) |
| Balance | Running balance computed client-side |
| Budget | Flag checkbox (tracks budget-relevant entries) |
| Notes | Editable free text |
| Source | Account name (shown in "All" view) |

**Edit behavior:** Click a row to edit in-place. Save on Enter/blur, cancel on Escape.

**Plaid sync:** "Sync Accounts" button calls `/api/plaid/sync`. Plaid transactions cannot be deleted (only edited). Manual transactions can be deleted.

**Categories:** FINANCIAL, MONTHLY BILLS, ENTERTAINMENT, GROCERIES, HOUSE, CAR, HEALTHCARE, KIDS, DOGS, TRAVEL, SHOPPING, ALCOHOL, RESTAURANT, TAKEOUT, GAS, GIFTS, KIDS SPORTS, JOB RELATED, XMAS, INCOME, OTHER

**API routes:**
- `GET /api/transactions?period=YYYY-MM&account_id=...` — fetch filtered transactions
- `POST /api/transactions` — create manual transaction
- `PUT /api/transactions/[id]` — update any field except `plaid_transaction_id`
- `DELETE /api/transactions/[id]` — delete (manual only)
- `POST /api/plaid/link-token` — create Plaid Link token
- `POST /api/plaid/exchange-token` — exchange public token, store access token, create account records
- `POST /api/plaid/sync` — pull 90 days of transactions from Plaid, upsert by `plaid_transaction_id`

### 4. Rule #1 Investing (`/app/investing`)

Research hub built around Phil Town's Rule #1 / value investing methodology. Accessible to Admin; optionally visible to Partner/Dependent (admin-configurable).

#### Big 5 Numbers Calculator (`/investing/calculator`)

For a given stock ticker, display and calculate the 5 key growth rates over 1, 5, and 10 year periods:

1. **Sales Growth Rate** (Revenue)
2. **EPS Growth Rate** (Earnings Per Share)
3. **Equity (Book Value) Growth Rate**
4. **Free Cash Flow Growth Rate**
5. **Return on Invested Capital (ROIC)**

- Input: stock ticker symbol
- Data source: financial data API (e.g., Financial Modeling Prep or Alpha Vantage) fetched via server-side API route
- Output: table of rates + pass/fail indicator (Rule #1 benchmark: all 5 ≥ 10%, ROIC ≥ 10%)
- "Add to Watchlist" button saves the analysis

#### Sticker Price & Margin of Safety (`/investing/calculator` — same page, below Big 5)

Calculates intrinsic value using Phil Town's method:

1. **Future EPS** = Current EPS × (1 + estimated growth rate)^10
2. **Future Price** = Future EPS × default P/E (2× growth rate, capped at 50)
3. **Sticker Price** = Future Price discounted back at 15% minimum acceptable rate of return
4. **Margin of Safety Price** = Sticker Price × 0.5 (buy at 50% discount)

- User can override estimated growth rate (default: min of analyst estimate and historical EPS growth)
- Displays: Sticker Price, MOS Price, current price vs. MOS (buy / wait / overvalued indicator)

#### Watchlist (`/investing/watchlist`)

- Table of tracked stocks: ticker, company name, current price, sticker price, MOS price, % to MOS, date added
- Click a row to open the full analysis view for that stock
- Status badge: **Buy** (price ≤ MOS), **Watch** (MOS < price ≤ Sticker), **Overvalued** (price > Sticker)
- Sort/filter by status

#### Stock Detail & 4Ms Checklist (`/investing/watchlist/[ticker]`)

Full research page for a single stock:

- Big 5 numbers + sticker/MOS prices (read from saved analysis or re-fetch)
- **4Ms Checklist** (structured form, saved per stock):
  - **Meaning** — Do I understand this business? Do I use/love the product? (free text + yes/no)
  - **Moat** — What is the durable competitive advantage? (Brand, Secret, Toll, Switching, Price) — select type + notes
  - **Management** — Is the CEO an owner-oriented operator? (notes on tenure, ownership stake, capital allocation track record)
  - **Margin of Safety** — Is the price right? (auto-populated from calculator, notes)
- Research notes (rich text / markdown)
- Date of last analysis
- Edit / archive actions

#### Technical Indicators Panel (`/investing/watchlist/[ticker]` — below 4Ms)

Three Rule #1 timing indicators displayed as charts, fetched via server-side API route using historical price data:

1. **MACD** (Moving Average Convergence Divergence)
   - 12-day EMA minus 26-day EMA = MACD line
   - 9-day EMA of MACD = Signal line
   - Histogram showing divergence between the two
   - Visual: line chart with MACD line, signal line, and bar histogram below price chart
   - Indicator: bullish crossover (MACD crosses above signal) vs. bearish crossover

2. **Stochastic Oscillator** (Dr. George C. Lane)
   - %K = (Current Close − 14-day Low) / (14-day High − 14-day Low) × 100
   - %D = 3-day SMA of %K (signal line)
   - Visual: oscillator chart with %K and %D lines, overbought (80) and oversold (20) threshold bands
   - Indicator: buy signal when %K crosses above %D in oversold zone; sell when crossing below in overbought zone

3. **10-Day Moving Average vs. Current Price**
   - Simple 10-day SMA overlaid on a price candle/line chart
   - Current price displayed alongside the SMA value
   - Indicator: price above SMA (uptrend / green), price below SMA (downtrend / red)

All three indicators displayed together. Data source: same financial data API used for Big 5 (Financial Modeling Prep provides OHLC price history). Charts rendered client-side using Recharts.

#### "Too Hard" Pile (`/investing/too-hard`)

A log of stocks the user has researched and consciously passed on, so they are not re-evaluated unnecessarily.

- Table columns: ticker, company name, date dismissed, reason (free text note)
- "Move to Too Hard" action available from any stock's detail page or the watchlist row menu
- Stocks in this list do NOT appear in the active Watchlist
- Can be searched/filtered by ticker or keyword in reason
- Each entry can be restored to Watchlist or permanently deleted

---

### 5. In Case I Die (`/app/contingency`)

A secure, compassionate guide for the partner to follow if the primary user dies. Read-only for Partner and Dependent roles; fully editable by Admin.

#### Step-by-Step Checklist (`/contingency/checklist`)

Interactive checklist organized by timeline:

- **Immediately (first 48 hours)**
  - Contact list: attorney, financial advisor, accountant (name, phone, email stored)
  - Location of original will / trust documents
  - Notify employer / HR department

- **First Week**
  - Obtain death certificates (how many, where to get them)
  - Notify Social Security Administration
  - Notify life insurance companies — policy numbers and contact info stored here
  - Freeze credit / notify credit bureaus

- **First Month**
  - File life insurance claims
  - Transfer / retitle accounts
  - Notify retirement plan administrators (401k, IRA beneficiary process)
  - Update estate documents

- **Ongoing**
  - Review budget and cash flow
  - Meet with financial advisor

Each checklist item: checkbox (Partner/Dependent can check off items to track progress), notes field, attached document or link.

Admin can add, edit, reorder, or remove checklist items.

#### Document & Info Vault (`/contingency/vault`)

Organized repository of critical information:

| Category | Fields |
|----------|--------|
| **Financial Accounts** | Institution, account type, account number (masked), login URL, username hint, how to access |
| **Insurance Policies** | Type, carrier, policy number, death benefit, contact, agent name/phone |
| **Retirement Accounts** | Account type, institution, balance (linked to Dashboard), beneficiary designation |
| **Real Estate** | Property address, mortgage lender, deed location, property tax info |
| **Legal Documents** | Will location, trust name/trustee, power of attorney, healthcare directive |
| **Advisors & Contacts** | Name, role, firm, phone, email, notes |
| **Digital Assets** | Service, username, how to access (passwords should NOT be stored here — reference a password manager) |
| **Income Sources** | Employer, HR contact, pension/benefits info, how to access pay stubs |

- No plaintext passwords stored — app shows a reminder to use a password manager (1Password, Bitwarden, etc.)
- Each vault entry has a "last verified" date and a prompt to review annually
- Printable view (`/contingency/print`) — generates a clean printer-friendly page of the entire guide for physical backup

---

## Data Models (PostgreSQL)

```
users               id, email, password_hash, role (admin|partner|dependent), created_at, updated_at
user_profiles       id, user_id (FK), first_name, last_name, date_of_birth, phone, address_line1, address_line2, city, state, postal_code, country, avatar_url (nullable), created_at, updated_at
plaid_items         id, user_id (FK), access_token, item_id (unique), institution_name, created_at, updated_at
accounts            id, user_id (FK), name, institution, type (checking|savings|investment|brokerage|retirement|real_estate|credit_card|mortgage|car_loan|student_loan|other_debt), balance, currency, plaid_account_id (nullable, unique), plaid_item_id (FK nullable), last_synced_at, created_at, updated_at
transactions        id, user_id (FK), account_id (FK nullable), plaid_transaction_id (nullable, unique), is_manual, amount, type (income|expense), category, description, check_number (nullable), date, is_posted, budget_flagged, notes, created_at, updated_at
stocks              id, ticker, company_name, sector, created_at, updated_at
watchlist_entries   id, user_id (FK), stock_id (FK), sticker_price, mos_price, growth_rate_used, big5_data (jsonb), added_at, updated_at
four_ms_entries     id, watchlist_entry_id (FK), meaning_notes, moat_type, moat_notes, management_notes, mos_notes, created_at, updated_at
research_notes      id, watchlist_entry_id (FK), content (text), created_at, updated_at
too_hard_entries    id, user_id (FK), ticker, company_name, reason (text), dismissed_at, updated_at
checklist_items     id, category, sort_order, title, description, created_by (FK users), created_at, updated_at
checklist_progress  id, item_id (FK), user_id (FK), completed, notes, completed_at, updated_at
vault_entries       id, category, title, fields (jsonb), last_verified_at, created_at, updated_at
contacts            id, name, role, firm, phone, email, notes, created_at, updated_at
```

---

## Pages / Routes

```
/login
/dashboard
/dashboard/accounts/new
/dashboard/accounts/[id]/edit
/dashboard/transactions/new

/investing
/investing/calculator
/investing/watchlist
/investing/watchlist/[ticker]
/investing/too-hard

/contingency
/contingency/checklist
/contingency/vault
/contingency/vault/[category]
/contingency/print

/monthly

/settings                    (admin only — invite partner/dependent, manage roles, Plaid setup)
```

---

## External Integrations

| Service | Purpose | Notes |
|---------|---------|-------|
| **Plaid** | Bank account sync | Server-side only; access tokens never sent to client |
| **Avatar storage** | User profile photos | Stored on disk at `public/uploads/avatars/{userId}.ext`; path saved in `user_profiles.avatar_url`. To survive server migrations, move to object storage (S3 or Cloudflare R2): upload files to the bucket, store the public bucket URL in `avatar_url`, and remove the local `/api/profile/avatar` disk-write logic. |
| **Financial Modeling Prep** (or Alpha Vantage) | Stock financial data for Big 5 calculator + OHLC price history for technical indicators | Free tier sufficient for personal use |
| **Recharts** | Client-side chart rendering for MACD, Stochastic, and 10-day MA charts | React-native, TypeScript-friendly |
| **NextAuth.js** | Authentication & session management | Credentials provider + JWT strategy |

---

## Implementation Phases (suggested order)

1. **Auth** — NextAuth setup, user table, login page, middleware
2. **Dashboard** — Account CRUD, manual balance entry, net worth calculation, basic charts
3. **Plaid** — Link widget, token storage, balance sync
4. **Contingency** — Checklist + vault (highest value for partner use case)
5. **Investing** — Big 5 calculator, sticker price, watchlist, 4Ms, technical indicators, Too Hard pile

---

## Verification Checklist

- [ ] Admin can log in and see dashboard; partner/dependent sees read-only view
- [ ] Adding/editing an account updates net worth total on dashboard
- [ ] Plaid link flow connects an account and syncs balance
- [ ] Big 5 calculator fetches real financial data and calculates rates correctly
- [ ] Sticker price and MOS price match manual Phil Town formula calculations
- [ ] Watchlist shows correct Buy/Watch/Overvalued status
- [ ] 4Ms checklist saves and persists per stock
- [ ] MACD, Stochastic, and 10-day MA charts render correctly for a given ticker using real price history
- [ ] Stochastic crossover buy/sell signals render at correct price points
- [ ] "Move to Too Hard" removes stock from watchlist and logs it with date + reason
- [ ] Too Hard pile is searchable; stocks can be restored to watchlist
- [ ] Partner/Dependent can view contingency checklist and check off items
- [ ] Vault entries display all fields; no plaintext passwords accepted
- [ ] Print view renders cleanly
- [ ] All routes redirect unauthenticated users to /login
