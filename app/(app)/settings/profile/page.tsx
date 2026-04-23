import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { ProfileForm } from './ProfileForm'

interface ProfileRow {
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
}

export default async function ProfilePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const result = await query<ProfileRow>(
    `SELECT first_name, last_name, date_of_birth, phone,
            address_line1, address_line2, city, state, postal_code, country
     FROM user_profiles WHERE user_id = $1`,
    [session.user.id]
  )

  const profile = result.rows[0] ?? null

  return (
    <main className="settings-page">
      <h1>Profile</h1>
      <ProfileForm profile={profile} />
    </main>
  )
}
