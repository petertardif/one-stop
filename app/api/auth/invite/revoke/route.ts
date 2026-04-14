import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const bodySchema = z.object({ id: z.string().uuid() })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  await query(
    `UPDATE invite_tokens SET expires_at = NOW() WHERE id = $1 AND used_at IS NULL`,
    [parsed.data.id]
  )

  return NextResponse.json({ message: 'Invite revoked' }, { status: 200 })
}
