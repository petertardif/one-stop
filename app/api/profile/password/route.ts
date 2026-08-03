import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { passwordSchema } from '@/lib/password'
import { sendPasswordChangedEmail } from '@/lib/email'
import { checkRateLimit } from '@/lib/rateLimit'

const bodySchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: passwordSchema,
    confirm_password: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'New passwords do not match',
    path: ['confirm_password'],
  })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Throttle per user, not per IP -- this endpoint verifies the current password, so it is
  // an online guessing target for anyone who gets hold of an authenticated session.
  if (!checkRateLimit(`change-password:${session.user.id}`, 5, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    )
  }

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { current_password, new_password } = parsed.data

  const result = await query<{ email: string; password_hash: string }>(
    'SELECT email, password_hash FROM users WHERE id = $1',
    [session.user.id]
  )
  const user = result.rows[0]
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await bcrypt.compare(current_password, user.password_hash))) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  // Compare against the stored hash rather than the submitted current password, so this
  // still catches a match when the two differ only by bcrypt's 72-byte truncation.
  if (await bcrypt.compare(new_password, user.password_hash)) {
    return NextResponse.json(
      { error: 'New password must be different from your current password' },
      { status: 400 }
    )
  }

  const passwordHash = await bcrypt.hash(new_password, 12)
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [
    passwordHash,
    session.user.id,
  ])

  // The change is already committed -- a failed notification must not fail the request.
  try {
    await sendPasswordChangedEmail(user.email)
  } catch (err) {
    const e = err as { code?: string; responseCode?: number; response?: string; message?: string }
    console.error('[change-password] notification email failed', {
      code: e.code,
      responseCode: e.responseCode,
      response: e.response,
      message: e.message,
    })
  }

  return NextResponse.json({ message: 'Password updated' }, { status: 200 })
}
