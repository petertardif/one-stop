import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const schema = z.object({
  completed: z.boolean(),
  notes: z.string().nullable().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { completed, notes } = parsed.data
  const completedAt = completed ? new Date().toISOString() : null

  await query(
    `INSERT INTO checklist_progress (item_id, user_id, completed, notes, completed_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (item_id, user_id) DO UPDATE
       SET completed = EXCLUDED.completed,
           notes = EXCLUDED.notes,
           completed_at = EXCLUDED.completed_at,
           updated_at = NOW()`,
    [params.id, session.user.id, completed, notes ?? null, completedAt]
  )

  return NextResponse.json({ success: true })
}
