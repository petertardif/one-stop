import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

interface ProfileRow {
  first_name: string | null
}

async function getFirstName(userId: string): Promise<string | null> {
  const result = await query<ProfileRow>(
    'SELECT first_name FROM user_profiles WHERE user_id = $1',
    [userId]
  )
  return result.rows[0]?.first_name ?? null
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const firstName = await getFirstName(session.user.id)
  const displayName = firstName ?? session.user.email

  return (
    <main>
      <h1>Welcome, {displayName}</h1>
    </main>
  )
}
