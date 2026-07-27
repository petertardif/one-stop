import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { SubscriptionsTable } from './SubscriptionsTable'

export default async function SubscriptionsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <main>
      <SubscriptionsTable role={session.user.role} />
    </main>
  )
}
