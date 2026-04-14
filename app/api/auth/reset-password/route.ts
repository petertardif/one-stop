import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { validatePasswordResetToken, consumePasswordResetToken } from '@/lib/tokens'

const bodySchema = z.object({
  token: z.string().min(1),
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

  const { token, password } = parsed.data

  const resetToken = await validatePasswordResetToken(token)
  if (!resetToken) {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetToken.user_id])
  await consumePasswordResetToken(token)

  return NextResponse.json({ message: 'Password updated' }, { status: 200 })
}
