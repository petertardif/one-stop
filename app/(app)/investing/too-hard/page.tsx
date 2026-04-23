import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { TooHardClient, TooHardRow } from './TooHardClient'

export default async function TooHardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const result = await query(
    `SELECT id, ticker, company_name, reason, dismissed_at
     FROM too_hard_entries
     WHERE user_id = $1
     ORDER BY dismissed_at DESC`,
    [session.user.id]
  )

  return (
    <div className="page-container page-container--wide">
      <h1 className="page-title">Too Hard Pile</h1>
      <TooHardClient initialRows={result.rows as TooHardRow[]} />
    </div>
  )
}
