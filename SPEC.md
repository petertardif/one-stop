# One Stop — App Specification

## Context

"One Stop" is a private, family-focused financial hub built on an existing Next.js 14 + PostgreSQL scaffold. The goal is to consolidate everything related to the family's financial life into a single trusted app: live account balances, investing research, and a contingency guide for the partner. The app needs three distinct user roles (admin, partner, and dependent), manual data entry plus optional Plaid bank sync, and three core feature areas.

---

## User Roles

| Role | Access |
|------|--------|
| **Admin** (primary user) | Full read/write across all sections |
| **Partner** | Read-only on Dashboard & "Contingency Plan"; access to investing research by default (configurable); some write access for specific sections (configurable) |
| **Dependent** | Read-only on Dashboard & "Contingency Plan"; access to investing research by default (configurable); some write access for specific sections (configurable) |

Authentication: email + password, JWT sessions via NextAuth.js. Role is stored on the user record in the database.

---

## App Shell & Responsiveness

The authenticated shell ([app/(app)/layout.tsx](app/(app)/layout.tsx)) is a fixed sidebar + main column. On **desktop** the sidebar is a 240px column with an optional 60px rail-collapse. Below **768px** it becomes an off-canvas **drawer** opened by a hamburger in the Topbar's top-left; a backdrop, Escape, or navigating closes it, and body scroll locks while open. Shared open/close state lives in `components/MobileNavContext.tsx`. Phone-width content collapses (stat cards, form rows) use a **640px** breakpoint. Wide data tables keep their horizontal-scroll containers on mobile rather than reflowing to cards.

## Core Modules

### 1. Authentication (`/app/(auth)`)

- Sign-in page (`/login`)
- Invite-only registration (admin sends invite link to partner or dependent)
- No public sign-up
- Session stored in HTTP-only cookie via NextAuth
- Middleware (`middleware.ts`) protects all routes; redirects unauthenticated users to `/login`

---

### 2. Financial Dashboard (`/app/dashboard`)

The primary landing page after login. An at-a-glance view **derived entirely from the feature modules** (Investments, Debts, Ledger, Budget, Subscriptions, Auto) — **not** the legacy `accounts` table. All figures come from a single `GET /api/dashboard?tz=IANA` call.

**Sections:**

#### Net Worth Summary
- **Assets = Σ latest value of active investments** (`investments` where `liquidated_at IS NULL`); **Liabilities = Σ latest balance of active debts** (`debt_accounts` where `paid_at IS NULL`); **Net Worth = Assets − Liabilities**.
- **Net-worth-over-time** line chart: the union of all investment + debt snapshot dates (last 12 months), each date's assets/liabilities computed by **carry-forward** (each account's latest snapshot on/before that date, via the shared `valueOnOrBefore` in `lib/snapshots.ts`), ending at today. Active accounts only (a liquidated/paid account drops out of the trend — a deliberate simplification).

#### At-a-Glance tiles
Compact tiles, each a link to its module: **This Week's 1k** (weekly remaining + spent → `/monthly`, via the shared `getWeeklyBudget` in `lib/weeklyBudget.ts`) · **Monthly Bills** (Budget Next-Monthly total + trailing-12-mo `monthly_average` → `/budget`) · **Subscriptions** (active /yr · /mo → `/subscriptions`) · **Auto Service** (cost YTD → `/auto`). (Portfolio/Total Debt are intentionally omitted — they'd duplicate the Net Worth assets/liabilities above.)

#### Monthly Cash Flow
- Income vs. expenses for the current month (from `transactions`), with a simple bar chart. (Transactions are entered in the Ledger.)

**Removed (pending Plaid):** the manual **Accounts Panel**, the **Debt Snapshot** table (superseded by the Debts module), the `accounts`-based net-worth math, and the per-load `net_worth_snapshots` write. The `accounts` table, `/dashboard/accounts/*` pages, `AccountForm`, `/api/accounts*`, and all Plaid code remain in the codebase (untouched) for the future Plaid + account-setup flow, but are no longer surfaced on the dashboard.

`GET /api/dashboard?tz=IANA` returns `{ netWorth {assets,liabilities,netWorth}, netWorthHistory [{date,assets,liabilities,netWorth}], cashFlow {income,expenses}, weekly {week_start,remaining,spent}, monthlyBills {nextMonthly,monthlyAverage}, subscriptions {perYear,perMonth}, auto {ytd} }`.

**Plaid Integration (future, not yet surfaced):**
- "Connect to bank" flow using Plaid Link widget; access tokens stored server-side (never exposed to client); manual "sync now" refreshes balances. Re-surface the Accounts Panel + Sync once this exists.

---

### 3. Monthly Budget / Ledger (`/app/monthly`)

A full transaction ledger showing credits and debits from the family's checking account and credit cards. Transactions are pulled from Plaid-connected accounts and stored locally. Manual entries (not tied to any bank account) can also be added.

**Filters** render as compact pill/**chip dropdowns** (icon + value) inline in the controls row — a **Period** chip and a **Category** chip:

**Period selector** — toggleable filter (**defaults to Last 3 Months**):
- All time
- Individual year (dynamically generated from existing data)
- Last 6 months
- Last 3 months
- Individual month (with prev/next navigation)

**Account filter** — removed from the UI (there are no Plaid/bank accounts connected yet, so it only ever showed "All"). Re-introduce as a chip once Plaid accounts exist; the `account_id` filter still works server-side.

**Transaction table columns:**

| Column | Notes |
|--------|-------|
| ☑ | Row select checkbox (leftmost). Header checkbox = select-all (visible/filtered rows only). Disabled on non-manual/Plaid rows. Drives the toolbar Delete/Duplicate actions. |
| Date | Editable date picker |
| ✓ | Posted indicator (checkbox) |
| Category | Dropdown (predefined family categories) |
| Description | Editable text |
| Amount | Positive = credit (green), negative = debit (red) |
| Balance | Running checkbook balance, stored per row (`transactions.balance`) and shown in `seq` order; server-maintained on create/update/delete so period/account filters never recompute it |
| Budget | Account dropdown (edit/new rows): **N/A** (null) · **Bank** · **Chase CC** · **BoA CC**. A settled row shows an icon: Bank → landmark (neutral); Chase CC → credit-card in Chase blue `#117ACA`; BoA CC → credit-card in BoA red `#E31837`; N/A → nothing. `budget_flagged` (= `budget_account IS NOT NULL`, kept in sync by the API) still marks "in the weekly budget" for the remaining card + 1K Weekly Balance column (all three accounts). |
| 1K Weekly Balance | Per-week $1,000 allowance. Each week runs **Friday → Thursday**; every budget-flagged transaction in the week deducts from that week's $1,000 (resets to $1,000 each Friday). A week's base can be **topped up** (see below), so the effective allowance is `$1,000 + week top-ups`. Displayed on **every** row as the remaining allowance as of that row's position in its week (weeks with no flagged spend / top-ups show 1000.00). Computed server-side via a window function over the full ledger (never recomputed from the filtered subset). Independent of the regular Balance column — flagged transactions still hit Balance normally; the 1K weekly balance never affects Balance. |
| Notes | Editable free text. In the read view, shown as a note icon only (when notes exist); hovering the icon reveals the full note text. **Check # lives here too**: there is no standalone Check # column — in edit/new rows the Notes cell stacks a check-# input above the notes input (placeholders "Add check # here" / "Add notes here"); in the read view a **banknote** icon appears beside the notes icon when a check # exists, its tooltip reading `#<number>`. (`transactions.check_number` is unchanged.) |

(The `transactions.account_id`/Source is retained in the DB but no longer shown as a column.)

**Add / Edit:** both use a **modal** (shared `RecordModal`), not inline rows — the row set grew too complex to edit in place. The row's edit (✎) button opens the modal pre-filled; `Add` opens it empty (new transactions are always manual — no account/source picker). Field order: Date · Posted (**defaults unchecked**) · Category · Budget account (**defaults to Chase CC**) · Description · Type (+ Credit / − Debit) · Amount (positive; Type sets the sign) · Check # · Notes. The **Amount** input is a **cash-register money field** — digits fill from the right as cents and the decimal is inserted automatically (`1234` → `12.34`). **Check # only shows when Budget account = Bank.** **Save is disabled until a non-zero Amount, a Category, and a Description are entered.** Closes on Save/Cancel/×/backdrop/Escape.

**Toolbar actions:** `Mark as…`, `Duplicate`, `Delete`, `Add` (right group). **`Add`** is a filled-primary **dropdown** (chevron; same open/outside-click/Escape behavior as `Mark as…`) with two icon options — **New Transaction** (opens the add-transaction modal) and **Amount to 1k Weekly** (opens the weekly top-up modal). Every other button (including `Delete`) is an accent-outline secondary; every button carries an icon + label. **`Sync` is hidden** (gated behind `SHOW_SYNC` in `MonthlyLedger.tsx`) until Plaid + an account-setup flow exist; it will return to the left of the toolbar then.

**Mobile controls:** below 768px the inline controls row collapses to a single **Filters** button that opens a modal containing the two filters (Period · Category) and the action buttons (Mark as… · Duplicate · Delete · Add — where **Add** is the same two-option dropdown). **Sync Accounts is hidden on mobile.** Desktop is unchanged.

**Pagination:** the ledger is **server-paginated**, newest-first. A footer below the table has a **Rows-per-page** dropdown (`100` default · `300` · `500` · `1000`), a `start–end of total` count, and page controls: **« First · ‹ Prev · windowed page numbers (with … ellipsis) · Next › · Last »**. Changing a filter or the page size resets to **page 1**; the page auto-clamps if the total shrinks (e.g. after a bulk delete). The running balance / 1K weekly balance are unaffected (computed server-side over the full ledger).

**Bulk actions:** Row checkboxes drive several toolbar buttons, enabled once ≥1 row is selected:
- **Delete** — opens a confirm modal ("You are about to delete X transactions. Do you want to proceed?"); on confirm, bulk-deletes the selected manual rows and re-shifts the running `balance` of later rows. Only manual rows are selectable (Plaid protected).
- **Duplicate** — copies each selected row as a new **manual** transaction: all fields copied as-is, keeps the original date, description prefixed with `Copy of: `, appended to the ledger tail with a fresh `seq`/`balance`.
- **Mark as…** — a dropdown menu (closes on pick / outside-click / Escape) that mass-updates **one field at a time** across the selected **manual** rows: **Posted** / **Unposted** (`is_posted`), then **Budget-N/A** / **Budget-Bank** / **Budget-Chase CC** / **Budget-BoA CC** (`budget_account`, with `budget_flagged` kept in sync). Neither field touches the running `balance`, so no re-shift.

**Weekly budget top-up:** the **Amount to 1k Weekly** option in the toolbar's `Add` dropdown opens a modal (amount + week dropdown — last 2 weeks, current, next 3). Each submission **raises** the chosen Fri→Thu week's allowance by the amount (e.g. $1,000 → $1,200). Stored in `weekly_budget_adjustments` (keyed by the Friday `week_start`); affects **only** the 1K weekly balance — it never creates a ledger row and never touches the checkbook `balance` column. The ledger window function and the current-week card both add the week's summed top-ups.

**Plaid sync:** the "Sync" button (which calls `/api/plaid/sync`) is **hidden until Plaid is implemented with an account-setup flow** — there are no connected accounts yet, so syncing has nothing to do. Re-enable via `SHOW_SYNC = true` in `MonthlyLedger.tsx` once account connection exists. When live: Plaid transactions cannot be deleted (only edited); manual transactions can be deleted.

**Categories:** FINANCIAL, MONTHLY BILLS, ENTERTAINMENT, GROCERIES, HOUSE, CAR, HEALTHCARE, KIDS, DOGS, TRAVEL, SHOPPING, ALCOHOL, RESTAURANT, TAKEOUT, GAS, GIFTS, KIDS SPORTS, JOB RELATED, XMAS, INCOME, OTHER

**API routes:**
- `GET /api/transactions?period=YYYY-MM&category=...&account_id=...&page=1&pageSize=100&tz=IANA` — fetch filtered, **paginated** transactions. Period, **category**, and account filters are all applied **server-side**; results are **newest-first** and sliced by `page`/`pageSize` (`pageSize` restricted to `100|300|500|1000`, default 100). Returns `{ rows, total, page, pageSize }` where `total` is the full filtered count (`COUNT(*) OVER()`). The running `balance` + 1K weekly balance are still computed over the **full** ledger inside the CTE, so every page's figures stay correct. The relative `3m`/`6m` periods compute "N months ago" from **today in the client's timezone** (`tz`, e.g. `America/Denver`), not the DB's UTC.
- `POST /api/transactions` — create manual transaction
- `PUT /api/transactions/[id]` — update any field except `plaid_transaction_id`
- `DELETE /api/transactions/[id]` — delete (manual only)
- `POST /api/transactions/bulk-delete` — `{ ids: [] }`; delete manual rows, re-shift running balances (transactional)
- `POST /api/transactions/bulk-duplicate` — `{ ids: [] }`; copy rows as manual, keep date, prefix description `Copy of: ` (transactional)
- `POST /api/transactions/bulk-update` — `{ ids, field: 'is_posted'|'budget_account', value }`; mass "Mark as…" update of one field across selected manual rows (admin). `budget_account` also syncs `budget_flagged`; no `balance` impact
- `GET /api/transactions/weekly-budget[?week_start=YYYY-MM-DD][&tz=IANA]` — for a Fri→Thu week (the given Friday, else the **current** week computed from today in the client's `tz`, not UTC), returns `remaining` (`$1,000 + week top-ups + spend across **all** budget accounts`) and `spent` (`ABS(SUM(amount))` over **Chase CC only**), independent of the ledger's period filter. Powers the two cards above the filter row: a fixed **current-week remaining** card (all accounts) and a **1k Budget Spent** total card (**Chase CC only**) whose own small week dropdown (last 2 / current / next 3, defaulting to current) selects the week to sum.
- `POST /api/transactions/weekly-budget` — `{ week_start, amount }`; add a top-up to a week's 1K allowance (admin). Raises the weekly balance only; no ledger row, no checkbook impact.
- `POST /api/plaid/link-token` — create Plaid Link token
- `POST /api/plaid/exchange-token` — exchange public token, store access token, create account records
- `POST /api/plaid/sync` — pull 90 days of transactions from Plaid, upsert by `plaid_transaction_id`

### 3.1 Budget (`/app/budget`)

A table of recurring budget line items (bills), under the Financials sidebar group. Admin read/write; partner/dependent read-only.

**Columns:** select checkbox · Description · Category (free-form; predefined budget taxonomy + user-typed) · Due Date (day-of-month dropdown, 1–31) · Auto/Manual (header info icon; values Autopay | Manual) · Duration (Annual | Monthly | Bi-Weekly | Weekly) · Annual ($) · Monthly Average ($) · Next Monthly ($) · Actions.

**One price per item**, entered at its native cadence. Derived:
- `Annual = amount × { annual:1, monthly:12, biweekly:26, weekly:52 }`
- `Next Monthly = Annual ÷ 12`
- **Monthly Average** — a single figure (total row only): trailing-12-month net `MONTHLY BILLS` spend from the ledger ÷ 12.

**Total row** sums Annual and Next Monthly; shows Monthly Average in its own cell.

**Active/Archived tabs.** CRUD with **archive** (soft, `archived_at`) instead of delete; archived items restorable. Rows are click-to-edit inline; **Add** opens a modal (Description · Category · Due date · Auto/Manual · Duration · Price, with Next Monthly shown read-only), and Save is disabled until a description is entered.

**Sorting / reordering / filtering:**
- **Column sort** — click any data-column header (Description, Category, Due Date, Auto/Manual, Duration, Annual, Next Monthly) to sort asc → desc → back to manual order. Monthly Average (aggregate-only), the checkbox, and Actions are not sortable.
- **Drag-to-reorder** — rows have a persisted manual order (`budget_items.sort_order`); drag a row to a new position to save it (`/api/budget-items/reorder`, optimistic). Enabled only in manual order with no active search/category filter/column sort.
- **Search** — text box next to the Archived tab; filters by description or category.
- **Category filter** — dropdown next to search; filters to a single category. Totals reflect the visible (filtered) rows.

**Add to Ledger:** select items → **Add to Ledger** opens a **preview modal**: a target **month** picker (last month → +5 months, default **next month**), the list of selected bills each with its computed post date + amount, and a total; **Add N to ledger** confirms. Posts each as a `transactions` row in the chosen month on the item's **Due Date day** (clamped to the month's last day, e.g. 31 → Feb 28/29; no Due Date → 1st), category `MONTHLY BILLS`, amount = Next Monthly (expense), **`is_posted` = false** (posts unchecked), tagged with `budget_item_id`. **Deduped** by `(budget_item_id, month)` so a bill can't post twice per month (skips reported back); maintains ledger `seq`/`balance`. On success the app **redirects to the ledger opened on that month** (`/monthly?period=YYYY-MM`).

**API routes:**
- `GET /api/budget-items?archived=` — items + `monthly_average`
- `POST /api/budget-items` — create (admin)
- `PUT /api/budget-items/[id]` — edit fields / archive / restore (admin)
- `POST /api/budget-items/add-to-ledger` — `{ ids, month? }` (`month` = `YYYY-MM`, defaults to next month); post selected items to the ledger for that month, `is_posted` false, deduped by `(budget_item_id, month)` (admin)
- `POST /api/budget-items/reorder` — `{ ids }` in new display order; rewrites `sort_order` (admin)

### 3.2 Debts (`/app/debts`)

A standalone debts tracker under the Financials sidebar group — **independent** of the Dashboard `accounts` / net worth. Admin read/write; partner/dependent read-only. Modeled on **Investments**: each debt is a parent account with a normalized dated **balance history** (`debt_snapshots`, one balance per date); the collapsed row shows the latest balance, and clicking a row expands its full history.

**Three tabs** (default **Short Term**):
- **Short Term** / **Long Term** — active (not paid off) debts of that term.
- **Paid Off** — debts marked paid (nothing owed); inserts a **Type** (Short/Long) column so both terms are distinguishable. History is retained.

**Charts (top of page, reflect the active tab's debts):**
- **Total debt over time** (area) — for each snapshot date, sums every debt's **carry-forward** balance (its most recent snapshot on or before that date), so a debt you didn't update that day still counts at its last known balance. A debt contributes $0 to dates before its first snapshot.
- **Allocation** (donut) — latest balance per debt, grouped by a **Category / Debt** toggle.
- **Per-debt balance over time** (multi-line) — one line per debt across snapshot dates, each debt **carried forward** from its last snapshot (line stays flat until its next update; no line before its first snapshot). Legend shows the debt name, disambiguated with its category only when a name is shared.

On the **Paid Off** tab both of these roll every short-term debt into a single **Short Term** series/slice (they are dozens of one-off line items), leaving long-term debts individual. Allocation there also measures each debt by its **Total Paid Off** (peak balance) rather than its latest balance, which is 0 for a paid-off debt.

**Columns** (Short/Long): select checkbox · expand · Name · Category · Latest Balance · Change (vs prior snapshot; a **falling** balance is green, a rising one red) · Latest Date · Actions (edit ✎, Mark as Paid, delete). **Paid Off** renames **Latest Balance → Total Paid Off** (the peak/largest snapshot balance the debt ever carried = the full amount paid off — never a sum of snapshots; equals the amount for one-off items and the highest balance ever reached for long-term/credit-card debts), **drops the Change column**, inserts a **Type** column before Actions, and swaps Edit/Mark-as-Paid for **Restore**.

- **Category** — free-form (predefined debt taxonomy: MORTGAGE, CAR LOAN, STUDENT LOAN, CREDIT CARD, PERSONAL LOAN, MEDICAL, TAXES, OTHER + user-typed).
- Inline click-to-edit rows (name / category / term). `New Debt` opens a **modal** (Name · Category · Term · Balance · Balance date) whose **term is auto-set to the active tab** and whose **date defaults to today**; the balance is saved as the debt's **first snapshot** in the same transaction as the account. Save is disabled until a name is entered; leaving the balance blank creates the debt with no snapshots.
- **Balance history** — expand a row to see all dated balances (admin can inline-edit a value or delete a snapshot). **Add snapshot date** (modal): pick a date, enter each debt's balance in one pass (upserts).
- **Search / column sort / drag-reorder** (same controls as Investments, next to the tabs). Sorting any data column is view-only. **Drag-reorder** (Short/Long tabs, when unsorted/unsearched) persists a manual order via `debt_accounts.sort_order`.
- **Totals footer** sums Latest Balance across the visible rows.

**Toolbar** — Short/Long: `New Debt`, `Add snapshot date`, `Mark as Paid`, `Delete`. Paid Off: `Restore`, `Delete` (checkbox-driven; per-row actions also available).

**API routes:**
- `GET /api/debts` — all debt accounts (manual order) each with their snapshot series + distinct `categories`; client filters by tab
- `POST /api/debts` — create account `{ name, category, term, balance?, as_of? }` (admin); appends to the tail. When `balance` is supplied it writes the debt's first `debt_snapshots` row (dated `as_of`, default `CURRENT_DATE`) in the same transaction
- `PUT /api/debts/[id]` — edit name / category / term (admin)
- `DELETE /api/debts/[id]` — delete account + its snapshots (admin, cascade)
- `POST /api/debts/snapshots` — `{ as_of, values: [{ debt_account_id, balance }] }`; upsert balances for a date (null clears); powers the modal + inline edits (admin, transactional)
- `DELETE /api/debts/snapshots/[id]` — delete a single balance cell (admin)
- `POST /api/debts/mark-paid` — `{ ids }`; set `paid_at` (admin)
- `POST /api/debts/restore` — `{ ids }`; clear `paid_at` (admin)
- `POST /api/debts/reorder` — `{ ids }`; rewrite `sort_order` to the new display order (admin)

### 3.3 Subscriptions (`/app/subscriptions`)

A subscriptions ledger under the Financials sidebar group, mirroring the Debts page UI. Admin read/write; partner/dependent read-only. No running balance.

**Two tabs** (default **Active**):
- **Active** — current subscriptions.
- **Cancelled** — subscriptions with a `cancelled_at` set; shows an added **Cancelled** date column.

**Columns:** select checkbox · Category · Service · Company · Price/Year · Price/Month · Renewal · Actions. Cancelled tab inserts a **Cancelled** (date) column before Actions.

- **Prices** are entered manually per cadence — Price/Year and Price/Month are independent (no derivation).
- **Renewal** is structured via a cycle picker: **Monthly** → day-of-month (renders "Monthly - 1st"); **Annual** → a specific date.
- **Category** — free-form (predefined: ENTERTAINMENT, STORAGE, FITNESS, FINANCIAL, GROCERIES, SUBSCRIPTION, TECHNOLOGY, OTHER + user-typed). Technology subs are just Category = TECHNOLOGY.
- Inline click-to-edit rows; **Add** opens a modal (Service · Company · Category · Price/Year · Price/Month · Renewal cycle · Renewal day/date); Save is disabled until a service is entered.
- **Search / column sort / drag-reorder / category filter** (same controls as Budget, next to the tabs). Sorting any data column is view-only. **Drag-reorder** (Active tab only, when unsorted/unfiltered) persists a manual order via `subscriptions.sort_order` (`/api/subscriptions/reorder`).
- **Totals footer** sums Price/Year and Price/Month across the visible rows.

**Toolbar** — Active: `Add`, `Mark as Cancelled`, `Duplicate`. Cancelled: `Restore`, `Delete` (checkbox-driven; Mark as Cancelled / Restore / Delete also available per-row). Duplicate copies active rows as new active rows (`Copy of: ` service prefix).

**API routes:**
- `GET /api/subscriptions?tab=active|cancelled` — rows for the tab + distinct `categories`
- `POST /api/subscriptions` — create (admin)
- `PUT /api/subscriptions/[id]` — edit fields (admin)
- `DELETE /api/subscriptions/[id]` — delete a row (admin)
- `POST /api/subscriptions/mark-cancelled` — `{ ids }`; set `cancelled_at` (admin)
- `POST /api/subscriptions/restore` — `{ ids }`; clear `cancelled_at` (admin)
- `POST /api/subscriptions/bulk-duplicate` — `{ ids }`; copy active rows (admin, transactional)
- `POST /api/subscriptions/reorder` — `{ ids }`; rewrite `sort_order` to the new display order (admin)

### 3.4 Auto (`/app/auto`)

A vehicle service/maintenance log under the Financials sidebar group. Admin read/write; partner/dependent read-only. One row per service event; **no running balance** (costs are plain positive amounts).

**No tabs.** Instead three filters sit in the controls row:
- **Cars** — multiselect dropdown (checkbox list; empty = all cars). Options derived from existing rows.
- **Years** — multiselect dropdown (empty = all years). Options derived from the year of each row's date.
- **Search** — matches Car / Service Description / Service Performed by.

**Columns:** select checkbox · Date · Car · Service Description · Cost · Service Performed by · Actions.

- Every column except Actions is **sortable** (click header; asc → desc → back to manual order).
- **Drag-to-reorder** rows (persisted via `sort_order`), available only when no sort/search/filter is active.
- **Totals footer** sums Cost across the visible rows.
- Inline click-to-edit rows (save/cancel icons); **Add** opens a modal (Date · Car · Service description · Cost · Service performed by); Save is disabled until a car and date are entered.

**Toolbar** (admin): `Add`, `Duplicate`, `Delete` (checkbox-driven; per-row Edit / Duplicate / Delete also available). Duplicate copies rows with a `Copy of: ` description prefix, appended to the tail.

**API routes:**
- `GET /api/auto` — the full service log (car/year filters applied client-side)
- `POST /api/auto` — create (admin); appends to the tail
- `PUT /api/auto/[id]` — edit fields (admin)
- `DELETE /api/auto/[id]` — delete a row (admin)
- `POST /api/auto/bulk-duplicate` — `{ ids }`; copy rows (admin, transactional)
- `POST /api/auto/reorder` — `{ ids }`; rewrite `sort_order` to the new display order (admin)

### 3.5 Charitable Donations (`/app/donations`)

A flat log of charitable donations the family **gives**, kept for tax records — the **last** link in the Financials sidebar group. Admin read/write; partner/dependent read-only. One row per donation; **no running balance** (amounts are plain positive numbers).

**No tabs.** Controls row:
- **Years** — multiselect dropdown (empty = all years). Options derived from the year of each row's date.
- **Search** — matches Organization / Donor Name / Donor Contact Info / Notes.

**Columns:** select checkbox · Date · Organization (recipient charity) · Donor Name · Donor Contact Info · Donation Amount · Payment Method (Cash | Non-cash) · Value of goods/services · Notes · Actions.

- **Payment Method** — dropdown, `cash` | `non_cash` (in-kind). **Value of goods/services** captures any quid-pro-quo benefit received back (reduces the deductible amount).
- Every data column is **sortable** (click header; asc → desc → back to manual order). No drag-reorder.
- **Totals footer** sums Donation Amount and Value of goods/services across the visible rows.
- Inline click-to-edit rows (save/cancel icons); **Add** opens a modal (Date · Organization · Donor name · Donor contact · Donation amount · Payment method · Value of goods/services · Notes); Save is disabled until an organization and date are entered.

**Toolbar** (admin): `Add`, `Duplicate`, `Delete` (checkbox-driven; per-row Edit / Duplicate / Delete also available). Duplicate copies rows with a `Copy of: ` organization prefix, appended to the tail.

**API routes:**
- `GET /api/charitable-donations` — the full donation log (year filter applied client-side)
- `POST /api/charitable-donations` — create (admin); appends to the tail
- `PUT /api/charitable-donations/[id]` — edit fields (admin)
- `DELETE /api/charitable-donations/[id]` — delete a row (admin)
- `POST /api/charitable-donations/bulk-duplicate` — `{ ids }`; copy rows (admin, transactional)

---

### 4. Rule #1 Investing (`/app/investing`)

Research hub built around Phil Town's Rule #1 / value investing methodology. Accessible to Admin; optionally visible to Partner/Dependent (admin-configurable).

#### Investments (`/investing/investments`)

A portfolio tracker for the family's real accounts (retirement, college, savings) — the **first** link in the Investing sidebar submenu. Distinct from the Rule #1 research tools below. Admin read/write; partner/dependent read-only.

Two data models: an `investments` account row (brokerage, type, owner "in whose name", type description, contribution cadence/amount/note, strategy) and a normalized `investment_snapshots` time series (one dated balance per account). Normalizing snapshots lets new valuation dates be added forever and powers the charts.

**Active/Liquidated tabs** (default **Active**): **Liquidate** archives an account (sets `investments.liquidated_at`) without touching its snapshots. The **Active** tab shows non-liquidated accounts; the **Liquidated** tab shows liquidated ones and adds a **Liquidated** (date) column. **Both the charts and the summary/total below always reflect only the current tab's accounts** — the Active view excludes liquidated data entirely, and switching to Liquidated recomputes the charts from liquidated accounts only.

**Charts (top of page):**
- **Portfolio value over time** (area chart, top-left) — for each snapshot date, sums every account's **carry-forward** value (its most recent snapshot on or before that date), so an account you didn't update that day still counts at its last known value. An account contributes $0 to dates before its first snapshot.
- **Allocation** (donut, top-right) — latest value per account grouped by a **Type / Owner** toggle.
- **Per-account growth** (multi-line, full width below) — one line per account across snapshot dates, each account **carried forward** from its last snapshot (flat until its next update; no line before its first snapshot).

**Summary table** (one row per account, click to expand):
- Columns: select checkbox · expand · Brokerage · Type · Owner · Description · Contribution (cadence · amount, note flagged with `*`) · Latest Value · Change (vs. prior snapshot, green/red) · *(Liquidated tab only: Liquidated date)* · Actions.
- **Search** (brokerage/type/owner/description), **column sort** (asc → desc → manual), **drag-to-reorder** (persisted `investments.sort_order`, Active tab only when unsorted/unsearched).
- **Total row** sums Latest Value across visible rows.
- **Expand a row** → balance history (all snapshots, admin can inline-edit a value or delete a snapshot) + strategy notes.

**Toolbar (admin):** Active tab — `New Investment` (inline new account row) · `Add snapshot date` (modal: pick a date, enter each account's balance in one pass — upserts) · `Liquidate` · `Delete` (all checkbox-driven; per-row Edit/Liquidate/Delete also available). Liquidated tab — `Restore` (checkbox-driven; per-row Restore also available).

**API routes:**
- `GET /api/investments` — accounts (manual order) each with their snapshot series, plus distinct snapshot dates
- `POST /api/investments` — create account (admin); appends to the tail
- `PUT /api/investments/[id]` — edit account fields (admin)
- `DELETE /api/investments/[id]` — delete account + its snapshots (admin, cascade)
- `POST /api/investments/snapshots` — `{ as_of, values: [{ investment_id, value }] }`; upsert balances for a date (null clears); powers the modal + inline edits (admin, transactional)
- `DELETE /api/investments/snapshots/[id]` — delete a single snapshot cell (admin)
- `POST /api/investments/reorder` — `{ ids }`; rewrite `sort_order` to the new display order (admin)
- `POST /api/investments/liquidate` — `{ ids }`; set `liquidated_at = NOW()` (admin)
- `POST /api/investments/restore` — `{ ids }`; clear `liquidated_at` (admin)

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

### 5. Contingency Plan (`/app/contingency`)

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

#### Messages (`/contingency/messages`) — death-triggered messages

The sidebar **Contingency Plan** entry is the **last** item and is an **expandable group** (clickable `/contingency` landing + caret) with sub-links: **`In Case of Death`** (Messages — a **static, parent-neutral** label since either parent could be the deceased), **Checklist**, **Document Vault**.

**Two-parent model.** The parents = **`admin` + `partner_admin`** (e.g. mom + dad). **Authors / possible deceased = the two parents only** — they co-author one shared set of messages for each other and their dependents. **Recipients** = `partner`, `dependent` (+ the surviving parent). Dependents can operate the death gate but **cannot author** messages.

- **One shared death event** (`death_event`, single row): `died_at` is NULL until someone confirms the gate; on confirm it also records `deceased_user_ids` — the parent(s) who passed (1, or **both**). Delivery is **pull** — messages become visible on the Messages page once due, filtered to those **authored by a deceased parent**.
- **Message** (`goodbye_messages`): targets **either a role** or a **specific person** (`audience_user_id`) — enforced by a `num_nonnulls(audience_role, audience_user_id)=1` CHECK. The audience picker offers **Everyone**, **All Dependents**, then **each recipient listed by name** (the `role:partner` / `role:partner_admin` group options were removed; a specific partner is reached by their name). **Kinds**: `main` (shown first; text or video) · `letter` · `video` · `audio` · `gallery` · `open_when` (milestone letter). Video/audio/photos are **external links** (no object storage). **Release**: `immediate` · `offset` (N days/months/years after death; labeled "Specific time after death") · `date` (fixed) · `milestone` ("open when…", recipient self-opens) · `recurring_annual`.
- **Single page, role-branched** (`/contingency/messages`, `MessagesClient`): there is **no separate `/manage` route**. **Authors** (both parents) see the authoring UI inline — table of messages + Add/Edit modal — **and** the death gate below it (a surviving parent can confirm the other's death); **Reset death status** shows once death is confirmed. **Recipients** (partner/dependent) see the gate → delivery.
- **Death gate** (before death, shown to everyone — parent-neutral): "When a parent passes away there will be individual messages left here for you. **Has a parent passed away?**" with large **Yes** / **No** buttons. **No** → a comfort message. **Yes** → a **type-to-confirm** modal that (a) picks **who passed** — each existing parent by name, plus **Both** when there are two parents — and (b) requires the exact phrase "I understand this decision is irreversible." **Confirm Decision** (primary, disabled until a pick + the phrase match) + **Cancel and go back** (red/danger; recipients → `/contingency`, authors just close). Confirm → sets `died_at` + `deceased_user_ids`, emails the **surviving parent(s)** (`sendDeathTriggerEmail`), refreshes to the delivery view.
- The recipient-facing **delivery/display page is stubbed** (full experience is a later task).

**Messages API** (`app/api/contingency/goodbyes/` — path retained internally): `GET/POST /messages`, `PUT/DELETE /messages/[id]` (author-only = admin|partner_admin); `GET /status` (any auth; returns `died_at`, `confirmed_by`, `deceased_user_ids`); `POST /confirm-death` (any auth; body `{ deceased_ids: [] }` — 1–2 ids that must be parents; idempotent, sets `died_at` + `deceased_user_ids`, emails survivors); `POST /reset-death` (parent-only = admin|partner_admin; clears `died_at`/`confirmed_by`/`deceased_user_ids`).

---

## Data Models (PostgreSQL)

```
users               id, email, password_hash, role (admin|partner_admin|partner|dependent), created_at, updated_at
user_profiles       id, user_id (FK), first_name, last_name, date_of_birth, phone, address_line1, address_line2, city, state, postal_code, country, avatar_url (nullable), created_at, updated_at
plaid_items         id, user_id (FK), access_token, item_id (unique), institution_name, created_at, updated_at
accounts            id, user_id (FK), name, institution, type (checking|savings|investment|brokerage|retirement|real_estate|credit_card|mortgage|car_loan|student_loan|other_debt), balance, currency, plaid_account_id (nullable, unique), plaid_item_id (FK nullable), last_synced_at, created_at, updated_at
transactions        id, user_id (FK), account_id (FK nullable), plaid_transaction_id (nullable, unique), is_manual, seq (bigint, ledger order), amount, type (income|expense), category, description, check_number (nullable), date, is_posted, budget_flagged (bool — in the weekly budget; kept = budget_account IS NOT NULL), budget_account (nullable — bank|chase_cc|boa_cc; null = N/A), balance (running checkbook balance), notes, budget_item_id (FK budget_items nullable — set when posted via Budget "Add to Ledger"), created_at, updated_at
weekly_budget_adjustments id, user_id (FK), week_start (date — Friday that starts the Fri→Thu week), amount (numeric, signed — raises/lowers that week's 1K allowance), created_at, updated_at
budget_items        id, user_id (FK), description, due_date (text, day-of-month "1"–"31"), pay_type (autopay|manual), duration (annual|monthly|biweekly|weekly), amount (native-cadence price), category (text, nullable — free-form budget taxonomy), sort_order (int — persisted manual drag order), archived_at (nullable, soft-archive), created_at, updated_at
debt_accounts       id, user_id (FK), name, category (text, nullable — free-form debt taxonomy), term (short|long), sort_order (int — persisted manual drag order), paid_at (nullable — set = Paid Off tab), created_at, updated_at
debt_snapshots      id, debt_account_id (FK, cascade), as_of (date), balance (numeric), created_at, updated_at — UNIQUE (debt_account_id, as_of)
subscriptions       id, user_id (FK), category (text, nullable — free-form), service, company (nullable), price_per_year (nullable), price_per_month (nullable), renewal_cycle (monthly|annual), renewal_day (int 1–31, nullable — monthly), renewal_date (date, nullable — annual), sort_order (int — persisted manual drag order), cancelled_at (nullable — set = Cancelled tab), created_at, updated_at
auto_services       id, user_id (FK), date, car, description (nullable), cost (numeric, positive), performed_by (nullable), sort_order (int — persisted manual drag order), created_at, updated_at
charitable_donations id, user_id (FK), date, organization (nullable — recipient charity), donor_name (nullable), donor_contact (nullable), amount (numeric, positive), payment_method (cash|non_cash), goods_services_value (numeric, nullable — quid-pro-quo value received), notes (nullable), sort_order (int — default order), created_at, updated_at
investments         id, user_id (FK), brokerage, type (nullable — Retirement|College|Savings, free-form), owner (nullable — "in whose name"), type_description (nullable), contribution_cadence (none|weekly|biweekly|monthly|annual), contribution_amount (numeric, nullable), contribution_note (nullable), strategy (nullable), sort_order (int — persisted manual drag order), liquidated_at (nullable — set = Liquidated tab), created_at, updated_at
investment_snapshots id, investment_id (FK, cascade), as_of (date), value (numeric), created_at, updated_at — UNIQUE (investment_id, as_of)
stocks              id, ticker, company_name, sector, created_at, updated_at
watchlist_entries   id, user_id (FK), stock_id (FK), sticker_price, mos_price, growth_rate_used, big5_data (jsonb), added_at, updated_at
four_ms_entries     id, watchlist_entry_id (FK), meaning_notes, moat_type, moat_notes, management_notes, mos_notes, created_at, updated_at
research_notes      id, watchlist_entry_id (FK), content (text), created_at, updated_at
too_hard_entries    id, user_id (FK), ticker, company_name, reason (text), dismissed_at, updated_at
checklist_items     id, category, sort_order, title, description, created_by (FK users), created_at, updated_at
checklist_progress  id, item_id (FK), user_id (FK), completed, notes, completed_at, updated_at
vault_entries       id, category, title, fields (jsonb), last_verified_at, created_at, updated_at
death_event         id, singleton (bool, UNIQUE — one row), died_at (nullable — set on gate confirm, parent-resettable), confirmed_by (FK users nullable), deceased_user_ids (uuid[] nullable — the parent(s) who passed; validated in the API as role admin|partner_admin), created_at, updated_at
goodbye_messages    id, author_id (FK users), kind (main|letter|video|audio|gallery|open_when), audience_role (nullable — everyone|partner|dependent|partner_admin), audience_user_id (FK users nullable) [CHECK exactly one audience set], title, body, media_url (external link), release_mode (immediate|offset|date|milestone|recurring_annual), offset_amount (int nullable), offset_unit (days|months|years nullable), release_date (nullable), milestone_label (nullable), sort_order, created_at, updated_at
goodbye_gallery_images id, message_id (FK goodbye_messages, cascade), image_url, caption (nullable), sort_order, created_at, updated_at
contacts            id, name, role, firm, phone, email, notes, created_at, updated_at
```

---

## Pages / Routes

```
/login
/dashboard
/dashboard/accounts/new
/dashboard/accounts/[id]/edit

/investing
/investing/investments        (Investing submenu, first item — portfolio tracker w/ charts)
/investing/calculator
/investing/watchlist
/investing/watchlist/[ticker]
/investing/too-hard

/contingency                   (Contingency Plan — sidebar's last group)
/contingency/messages          ("In Case of Death" — authoring UI + gate (parents) / death gate + delivery stub (recipients))
/contingency/checklist
/contingency/vault
/contingency/vault/[category]
/contingency/print

/monthly                     (sidebar "Financials" > "Ledger")
/budget                      (Financials > "Budget" — line-item budget table)
/debts                       (Financials > "Debts" — Short Term / Long Term / Paid Off ledger)
/subscriptions               (Financials > "Subscriptions" — Active / Cancelled ledger)
/auto                        (Financials > "Auto" — vehicle service log w/ car/year filters)
/donations                   (Financials > "Charitable Donations" — donation log w/ year filter)

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
