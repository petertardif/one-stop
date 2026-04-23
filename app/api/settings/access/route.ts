import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const KEYS = ['investing_access_partner', 'investing_access_dependent'] as const

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await query(
    `SELECT key, value FROM app_settings WHERE key = ANY($1)`,
    [KEYS]
  )

  const settings: Record<string, boolean> = {}
  for (const row of result.rows) {
    settings[row.key] = row.value === 'true'
  }

  return NextResponse.json(settings)
}

const updateSchema = z.object({
  investing_access_partner: z.boolean().optional(),
  investing_access_dependent: z.boolean().optional(),
})

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const entries = Object.entries(parsed.data) as [string, boolean][]
  for (const [key, value] of entries) {
    await query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, String(value)]
    )
  }

  return NextResponse.json({ success: true })
}
