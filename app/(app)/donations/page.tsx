import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DonationsTable } from './DonationsTable'

export default async function DonationsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <main>
      <DonationsTable role={session.user.role} />
    </main>
  )
}
