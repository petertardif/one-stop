import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { plaidClient } from '@/lib/plaid'
import { query } from '@/lib/db'

const bodySchema = z.object({
  public_token: z.string(),
  institution_name: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { public_token, institution_name } = parsed.data

  const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token })
  const { access_token, item_id } = exchangeResponse.data

  // Store the Plaid item
  const itemResult = await query<{ id: string }>(
    `INSERT INTO plaid_items (user_id, access_token, item_id, institution_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (item_id) DO UPDATE SET access_token = EXCLUDED.access_token, updated_at = NOW()
     RETURNING id`,
    [session.user.id, access_token, item_id, institution_name ?? null]
  )
  const plaidItemId = itemResult.rows[0].id

  // Fetch accounts from Plaid and create local records
  const accountsResponse = await plaidClient.accountsGet({ access_token })
  const plaidAccounts = accountsResponse.data.accounts

  const insertedAccounts: string[] = []
  for (const acct of plaidAccounts) {
    const type = mapPlaidType(acct.type, acct.subtype ?? '')
    const result = await query<{ id: string }>(
      `INSERT INTO accounts (user_id, name, institution, type, balance, currency, plaid_account_id, plaid_item_id, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (plaid_account_id) DO UPDATE
         SET balance = EXCLUDED.balance, last_synced_at = NOW(), updated_at = NOW()
       RETURNING id`,
      [
        session.user.id,
        acct.name,
        institution_name ?? null,
        type,
        acct.balances.current ?? 0,
        acct.balances.iso_currency_code ?? 'USD',
        acct.account_id,
        plaidItemId,
      ]
    )
    insertedAccounts.push(result.rows[0].id)
  }

  return NextResponse.json({ success: true, account_ids: insertedAccounts }, { status: 201 })
}

function mapPlaidType(type: string, subtype: string): string {
  if (type === 'credit') return 'credit_card'
  if (type === 'loan') {
    if (subtype === 'mortgage') return 'mortgage'
    if (subtype === 'student') return 'student_loan'
    if (subtype === 'auto') return 'car_loan'
    return 'other_debt'
  }
  if (type === 'investment') return 'investment'
  if (subtype === 'checking') return 'checking'
  if (subtype === 'savings') return 'savings'
  return 'checking'
}
