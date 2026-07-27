import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { DebtsTable } from './DebtsTable'

export default async function DebtsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <main>
      <DebtsTable role={session.user.role} />
    </main>
  )
}
