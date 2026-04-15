import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { MonthlyLedger } from './MonthlyLedger'

interface AccountRow {
  id: string
  name: string
  institution: string | null
  type: string
}

async function getLedgerAccounts(userId: string): Promise<AccountRow[]> {
  const result = await query<AccountRow>(
    `SELECT id, name, institution, type FROM accounts
     WHERE user_id = $1
       AND type IN ('checking', 'savings', 'credit_card')
     ORDER BY type, name`,
    [userId]
  )
  return result.rows
}

export default async function MonthlyPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const accounts = await getLedgerAccounts(session.user.id)

  return (
    <main>
      <MonthlyLedger accounts={accounts} />
    </main>
  )
}
