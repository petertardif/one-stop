import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { ChecklistClient } from './ChecklistClient'

export interface ChecklistItem {
  id: string
  category: 'immediately' | 'first_week' | 'first_month' | 'ongoing'
  sort_order: number
  title: string
  description: string | null
  completed: boolean | null
  notes: string | null
  completed_at: string | null
}

export default async function ChecklistPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const result = await query<ChecklistItem>(
    `SELECT ci.id, ci.category, ci.sort_order, ci.title, ci.description,
            cp.completed, cp.notes, cp.completed_at
     FROM checklist_items ci
     LEFT JOIN checklist_progress cp ON cp.item_id = ci.id AND cp.user_id = $1
     ORDER BY ci.category, ci.sort_order, ci.created_at`,
    [session.user.id]
  )

  return (
    <ChecklistClient
      initialItems={result.rows}
      isAdmin={session.user.role === 'admin'}
    />
  )
}
