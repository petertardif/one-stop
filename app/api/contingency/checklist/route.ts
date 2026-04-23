import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const CATEGORIES = ['immediately', 'first_week', 'first_month', 'ongoing'] as const

const createSchema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await query(
    `SELECT ci.id, ci.category, ci.sort_order, ci.title, ci.description,
            cp.completed, cp.notes, cp.completed_at
     FROM checklist_items ci
     LEFT JOIN checklist_progress cp ON cp.item_id = ci.id AND cp.user_id = $1
     ORDER BY ci.category, ci.sort_order, ci.created_at`,
    [session.user.id]
  )

  return NextResponse.json(result.rows)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data

  // Default sort_order to end of category
  let sortOrder = d.sort_order
  if (sortOrder === undefined) {
    const maxResult = await query<{ max: number | null }>(
      `SELECT MAX(sort_order) AS max FROM checklist_items WHERE category = $1`,
      [d.category]
    )
    sortOrder = (maxResult.rows[0]?.max ?? -1) + 1
  }

  const result = await query<{ id: string }>(
    `INSERT INTO checklist_items (category, sort_order, title, description, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [d.category, sortOrder, d.title, d.description ?? null, session.user.id]
  )

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 })
}
