import { query } from './db'

export const WEEKLY_BUDGET = 1000

// The Friday that starts the Fri->Thu week containing `col`. Postgres DOW has Sun=0,
// so (dow + 2) % 7 is the number of days back to that Friday.
export const weekStartExpr = (col: string) =>
  `(${col} - ((EXTRACT(DOW FROM ${col})::int + 2) % 7))`

// Rows that consume the $1,000 weekly allowance. MONTHLY BILLS is budgeted separately
// (it has its own line items on /budget), so those rows are budget-flagged but
// deliberately excluded from every weekly figure.
//
// The COALESCE guards the NULL-category case: `category <> '...'` evaluates to NULL,
// not true, when category IS NULL, which would silently drop uncategorized rows from
// the total. Assumes the transactions table is aliased `t`.
export const COUNTS_TOWARD_WEEKLY =
  `t.budget_flagged AND COALESCE(UPPER(TRIM(t.category)), '') <> 'MONTHLY BILLS'`

export interface WeeklyBudget {
  week_start: string
  remaining: string
  spent: string
}

// A Friday→Thursday week's $1,000 allowance. Only rows matching COUNTS_TOWARD_WEEKLY
// count (budget-flagged, excluding MONTHLY BILLS). Defaults to the current week (from
// "today" in the caller's timezone, not the DB's UTC); an optional `weekStart` (a
// Friday) selects another. Amounts are signed (expenses negative):
//   remaining = 1000 + week top-ups + SUM(amount over all budget accounts)
//   spent     = ABS(SUM(amount over Chase CC only))
export async function getWeeklyBudget(
  userId: string,
  weekStart: string | null,
  tz: string
): Promise<WeeklyBudget> {
  const result = await query<WeeklyBudget>(
    `WITH today AS (
       -- "Today" in the user's local timezone (passed from the browser), not
       -- the DB's UTC, so the Fri→Thu week doesn't roll over a day early at night.
       SELECT (now() AT TIME ZONE $3::text)::date AS d
     ),
     wk AS (
       SELECT COALESCE($2::date, ${weekStartExpr('(SELECT d FROM today)')}) AS start
     ),
     adj AS (
       SELECT COALESCE(SUM(amount), 0) AS total
       FROM weekly_budget_adjustments
       WHERE user_id = $1 AND week_start = (SELECT start FROM wk)
     ),
     flagged AS (
       -- net_all: every budget account (powers remaining -- all 3 accounts).
       -- net_chase: Chase CC only (powers spent -- the 1k Budget Spent card).
       -- Both exclude MONTHLY BILLS via COUNTS_TOWARD_WEEKLY so the two figures agree.
       SELECT
         COALESCE(SUM(t.amount) FILTER (WHERE ${COUNTS_TOWARD_WEEKLY}), 0) AS net_all,
         COALESCE(SUM(t.amount) FILTER (
           WHERE t.budget_account = 'chase_cc' AND ${COUNTS_TOWARD_WEEKLY}
         ), 0) AS net_chase
       FROM wk
       LEFT JOIN transactions t
         ON t.user_id = $1
        AND t.date >= wk.start
        AND t.date < wk.start + 7
     )
     SELECT to_char((SELECT start FROM wk), 'YYYY-MM-DD') AS week_start,
            ${WEEKLY_BUDGET} + (SELECT total FROM adj) + (SELECT net_all FROM flagged) AS remaining,
            ABS((SELECT net_chase FROM flagged)) AS spent`,
    [userId, weekStart, tz]
  )

  return result.rows[0]
}
