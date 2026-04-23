import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const createSchema = z.object({
  category: z.string().min(1),
  title: z.string().min(1),
  fields: z.record(z.string(), z.string().nullable()).default({}),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')

  const params: unknown[] = []
  let where = ''
  if (category) {
    where = 'WHERE category = $1'
    params.push(category)
  }

  const result = await query(
    `SELECT id, category, title, fields, last_verified_at, created_at, updated_at
     FROM vault_entries ${where} ORDER BY category, title`,
    params
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
  const result = await query<{ id: string }>(
    `INSERT INTO vault_entries (category, title, fields)
     VALUES ($1, $2, $3) RETURNING id`,
    [d.category, d.title, JSON.stringify(d.fields)]
  )

  return NextResponse.json({ id: result.rows[0].id }, { status: 201 })
}
