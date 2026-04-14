import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { InviteSection } from './InviteSection'

interface PendingInvite {
  id: string
  email_hint: string | null
  expires_at: string
  created_at: string
}

async function getPendingInvites(): Promise<PendingInvite[]> {
  const result = await query<PendingInvite>(
    `SELECT id, email_hint, expires_at, created_at
     FROM invite_tokens
     WHERE used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC`
  )
  return result.rows
}

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') redirect('/dashboard')

  const pendingInvites = await getPendingInvites()

  return (
    <main className="settings-page">
      <h1>Settings</h1>
      <InviteSection pendingInvites={pendingInvites} />
    </main>
  )
}
