import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { HoldingsClient } from './HoldingsClient'

export default async function HoldingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <div className="page-container page-container--wide">
      <HoldingsClient canWrite={session.user.role === 'admin'} />
    </div>
  )
}
