import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { BudgetTable } from './BudgetTable'

export default async function BudgetPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <main>
      <BudgetTable role={session.user.role} />
    </main>
  )
}
