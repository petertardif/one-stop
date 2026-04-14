import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { validateInviteToken, consumeInviteToken } from '@/lib/tokens'

const bodySchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    )
  }

  const { token, email, password } = parsed.data

  const inviteToken = await validateInviteToken(token)
  if (!inviteToken) {
    return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 400 })
  }

  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)`,
    [email.toLowerCase(), passwordHash, inviteToken.role]
  )

  await consumeInviteToken(token)

  return NextResponse.json({ message: 'Account created' }, { status: 201 })
}
