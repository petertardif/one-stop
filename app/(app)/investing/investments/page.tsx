import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { InvestmentsTable } from './InvestmentsTable'

export default async function InvestmentsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <main>
      <InvestmentsTable role={session.user.role} />
    </main>
  )
}
