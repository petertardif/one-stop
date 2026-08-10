import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { MessagesClient } from './MessagesClient'

export interface Recipient {
  id: string
  role: string
  first_name: string | null
}

// A parent who can be the deceased (admin | partner_admin), for the who-died picker.
export interface Parent {
  id: string
  name: string
}

// Reading ?tab here rather than with useSearchParams keeps the client component out of a
// Suspense boundary. Anything other than 'messages' -- including no param at all, which is
// what the sidebar link produces -- resolves to the Confirm tab.
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const initialTab = searchParams.tab === 'messages' ? 'messages' : 'confirm'

  const role = session.user.role
  const isAuthor = role === 'admin' || role === 'partner_admin'

  const [parentsRes, statusRes, recipientsRes] = await Promise.all([
    query<{ id: string; role: string; first_name: string | null }>(
      `SELECT u.id, u.role, p.first_name
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.role IN ('admin', 'partner_admin')
       ORDER BY u.role, u.created_at`
    ),
    query<{ died_at: string | null; deceased_user_ids: string[] | null }>(
      `SELECT died_at, deceased_user_ids FROM death_event LIMIT 1`
    ),
    query<Recipient>(
      `SELECT u.id, u.role, p.first_name
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.role IN ('partner_admin', 'partner', 'dependent')
       ORDER BY p.first_name NULLS LAST, u.email`
    ),
  ])

  const parents: Parent[] = parentsRes.rows.map((p) => ({
    id: p.id,
    name: p.first_name?.trim() || (p.role === 'admin' ? 'Admin' : 'Partner admin'),
  }))
  const diedAt = statusRes.rows[0]?.died_at ?? null
  const deceasedIds = statusRes.rows[0]?.deceased_user_ids ?? []

  // Names of the parent(s) this death event is for (e.g. "Mom" or "Mom and Dad").
  const deceasedNames = parents.filter((p) => deceasedIds.includes(p.id)).map((p) => p.name)
  const deliveredName =
    deceasedNames.length === 0
      ? 'them'
      : deceasedNames.length === 1
        ? deceasedNames[0]
        : `${deceasedNames.slice(0, -1).join(', ')} and ${deceasedNames[deceasedNames.length - 1]}`

  // Stub count of messages addressed to this recipient by a deceased parent
  // (ignores release timing — the full delivery experience is a later task).
  let waitingCount = 0
  if (diedAt && !isAuthor && deceasedIds.length > 0) {
    const c = await query<{ n: string }>(
      `SELECT count(*) AS n FROM goodbye_messages
       WHERE author_id = ANY($1)
         AND (audience_user_id = $2 OR audience_role = 'everyone' OR audience_role = $3)`,
      [deceasedIds, session.user.id, role]
    )
    waitingCount = Number(c.rows[0].n)
  }

  return (
    <MessagesClient
      isAuthor={isAuthor}
      initialTab={initialTab}
      parents={parents}
      diedAt={diedAt}
      deliveredName={deliveredName}
      waitingCount={waitingCount}
      recipients={recipientsRes.rows}
    />
  )
}
