import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AccountForm } from './AccountForm'

export default async function NewAccountPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') redirect('/dashboard')

  return (
    <div className="page-container">
      <h1 className="page-title">Add Account</h1>
      <AccountForm mode="create" />
    </div>
  )
}
