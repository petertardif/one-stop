import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/Topbar'

interface ProfileRow {
  first_name: string | null
  avatar_url: string | null
}

async function getProfile(userId: string) {
  const result = await query<ProfileRow>(
    'SELECT first_name, avatar_url FROM user_profiles WHERE user_id = $1',
    [userId]
  )
  return result.rows[0] ?? null
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const profile = await getProfile(session.user.id)
  const firstName = profile?.first_name ?? session.user.email.split('@')[0]

  return (
    <div className="app-shell">
      <Sidebar role={session.user.role} />
      <div className="app-shell__main">
        <Topbar
          firstName={firstName}
          email={session.user.email}
          avatarUrl={profile?.avatar_url ?? null}
        />
        <main className="app-shell__content">
          {children}
        </main>
      </div>
    </div>
  )
}
