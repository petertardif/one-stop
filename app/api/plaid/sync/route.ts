import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { plaidClient } from '@/lib/plaid'
import { query } from '@/lib/db'

const bodySchema = z.object({
  account_id: z.string().uuid().optional(), // if omitted, syncs all user accounts
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { account_id } = parsed.data

  // Fetch Plaid-linked accounts (optionally filtered to one)
  const accountsResult = await query<{
    id: string
    plaid_account_id: string
    access_token: string
  }>(
    `SELECT a.id, a.plaid_account_id, pi.access_token
     FROM accounts a
     JOIN plaid_items pi ON pi.id = a.plaid_item_id
     WHERE a.user_id = $1
       AND a.plaid_account_id IS NOT NULL
       ${account_id ? 'AND a.id = $2' : ''}`,
    account_id ? [session.user.id, account_id] : [session.user.id]
  )

  if (accountsResult.rows.length === 0) {
    return NextResponse.json({ error: 'No Plaid-linked accounts found' }, { status: 404 })
  }

  // Group by access_token to batch Plaid calls
  const byToken = new Map<string, Array<{ id: string; plaid_account_id: string }>>()
  for (const row of accountsResult.rows) {
    const list = byToken.get(row.access_token) ?? []
    list.push({ id: row.id, plaid_account_id: row.plaid_account_id })
    byToken.set(row.access_token, list)
  }

  let upserted = 0

  for (const [access_token, accts] of byToken) {
    // Fetch 90 days of transactions
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 90)
    const endDate = new Date()

    const txResponse = await plaidClient.transactionsGet({
      access_token,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      options: {
        account_ids: accts.map((a) => a.plaid_account_id),
        count: 500,
      },
    })

    const plaidAccountMap = new Map(accts.map((a) => [a.plaid_account_id, a.id]))

    for (const tx of txResponse.data.transactions) {
      const localAccountId = plaidAccountMap.get(tx.account_id)
      if (!localAccountId) continue

      // Plaid: negative amount = debit, positive = credit (reversed from our convention)
      const amount = -tx.amount
      const type = amount >= 0 ? 'income' : 'expense'

      await query(
        `INSERT INTO transactions
           (user_id, account_id, plaid_transaction_id, is_manual, amount, type,
            category, description, date, is_posted, notes)
         VALUES ($1, $2, $3, false, $4, $5, $6, $7, $8, $9, null)
         ON CONFLICT (plaid_transaction_id) DO UPDATE
           SET amount = EXCLUDED.amount,
               category = EXCLUDED.category,
               description = EXCLUDED.description,
               date = EXCLUDED.date,
               is_posted = EXCLUDED.is_posted,
               updated_at = NOW()
         WHERE transactions.is_manual = false`,
        [
          session.user.id,
          localAccountId,
          tx.transaction_id,
          amount,
          type,
          tx.personal_finance_category?.primary ?? tx.category?.[0] ?? null,
          tx.merchant_name ?? tx.name,
          tx.date,
          !tx.pending,
        ]
      )
      upserted++
    }

    // Update account balances
    for (const plaidAcct of txResponse.data.accounts) {
      const localId = plaidAccountMap.get(plaidAcct.account_id)
      if (!localId) continue
      await query(
        `UPDATE accounts SET balance = $1, last_synced_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [plaidAcct.balances.current ?? 0, localId]
      )
    }
  }

  return NextResponse.json({ success: true, upserted })
}
