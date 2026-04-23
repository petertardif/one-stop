import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { InviteSection, type Invite } from './InviteSection'
import { ProfileSection, type Profile } from './ProfileSection'
import { AccessSection } from './AccessSection'

type Role = 'partner_admin' | 'partner' | 'dependent'

async function getInvites(): Promise<Invite[]> {
  const result = await query<Omit<Invite, 'status'> & { used_at: string | null }>(
    `SELECT id, email_hint, role, expires_at, used_at
     FROM invite_tokens
     ORDER BY created_at DESC`
  )
  return result.rows.map((row) => {
    let status: Invite['status']
    if (row.used_at) status = 'accepted'
    else if (new Date(row.expires_at) <= new Date()) status = 'expired'
    else status = 'pending'
    return { id: row.id, email_hint: row.email_hint, role: row.role, expires_at: row.expires_at, status }
  })
}

async function getDefaultRole(): Promise<Role> {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM users WHERE role IN ('partner_admin', 'partner')
     ) AS exists`
  )
  return result.rows[0]?.exists ? 'dependent' : 'partner'
}

async function getProfile(userId: string): Promise<Profile | null> {
  const result = await query<Profile>(
    `SELECT first_name, last_name, date_of_birth, phone,
            address_line1, address_line2, city, state, postal_code, country
     FROM user_profiles WHERE user_id = $1`,
    [userId]
  )
  return result.rows[0] ?? null
}

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') redirect('/dashboard')

  const [invites, profile, defaultRole, accessSettings] = await Promise.all([
    getInvites(),
    getProfile(session.user.id),
    getDefaultRole(),
    query(`SELECT key, value FROM app_settings`).then((r) => {
      const s: Record<string, boolean> = {}
      for (const row of r.rows) s[row.key] = row.value === 'true'
      return {
        investing_access_partner: s['investing_access_partner'] ?? true,
        investing_access_dependent: s['investing_access_dependent'] ?? true,
      }
    }),
  ])

  return (
    <main className="settings-page">
      <h1>Settings</h1>
      <ProfileSection profile={profile} email={session.user.email ?? ''} />
      <AccessSection initialSettings={accessSettings} />
      <InviteSection invites={invites} defaultRole={defaultRole} />
    </main>
  )
}
