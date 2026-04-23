import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { TransactionForm } from './TransactionForm'

export default async function NewTransactionPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') redirect('/dashboard')

  const result = await query(
    `SELECT id, name, institution, type FROM accounts WHERE user_id = $1 ORDER BY type, name`,
    [session.user.id]
  )

  const accounts = result.rows as { id: string; name: string; institution: string | null; type: string }[]

  return (
    <div className="page-container">
      <h1 className="page-title">Log Transaction</h1>
      <TransactionForm accounts={accounts} />
    </div>
  )
}
