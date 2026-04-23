import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  fields: z.record(z.string(), z.string().nullable()).optional(),
  last_verified_at: z.string().nullable().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await query(
    `SELECT id, category, title, fields, last_verified_at, created_at, updated_at
     FROM vault_entries WHERE id = $1`,
    [params.id]
  )

  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(result.rows[0])
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data
  const fields: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (d.title !== undefined) { fields.push(`title = $${idx++}`); values.push(d.title) }
  if (d.fields !== undefined) { fields.push(`fields = $${idx++}`); values.push(JSON.stringify(d.fields)) }
  if (d.last_verified_at !== undefined) { fields.push(`last_verified_at = $${idx++}`); values.push(d.last_verified_at) }

  if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  fields.push(`updated_at = NOW()`)
  values.push(params.id)

  const result = await query(
    `UPDATE vault_entries SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id`,
    values
  )

  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await query(
    `DELETE FROM vault_entries WHERE id = $1 RETURNING id`,
    [params.id]
  )

  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
