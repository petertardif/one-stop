import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { AccountForm } from '../../new/AccountForm'

interface Props {
  params: { id: string }
}

export default async function EditAccountPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') redirect('/dashboard')

  const result = await query(
    `SELECT id, name, institution, type, balance, interest_rate, minimum_payment
     FROM accounts WHERE id = $1 AND user_id = $2`,
    [params.id, session.user.id]
  )

  if (result.rowCount === 0) notFound()

  const account = result.rows[0] as {
    id: string
    name: string
    institution: string | null
    type: string
    balance: string
    interest_rate: string | null
    minimum_payment: string | null
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Edit Account</h1>
      <AccountForm mode="edit" account={account} />
    </div>
  )
}
