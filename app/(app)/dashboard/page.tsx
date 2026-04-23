import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { DashboardClient } from './DashboardClient'

interface ProfileRow {
  first_name: string | null
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const result = await query<ProfileRow>(
    'SELECT first_name FROM user_profiles WHERE user_id = $1',
    [session.user.id]
  )
  const firstName = result.rows[0]?.first_name
  if (!firstName) redirect('/settings/profile')

  const isAdmin = session.user.role === 'admin'
  return <DashboardClient firstName={firstName} isAdmin={isAdmin} />
}
