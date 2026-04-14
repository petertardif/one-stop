import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { createPasswordResetToken } from '@/lib/tokens'
import { sendPasswordResetEmail } from '@/lib/email'
import { checkRateLimit } from '@/lib/rateLimit'

const bodySchema = z.object({
  email: z.string().email(),
})

// Always return the same response to prevent user enumeration
const SUCCESS_RESPONSE = NextResponse.json(
  { message: "If that email is registered, you'll receive a reset link shortly." },
  { status: 200 }
)

export async function POST(req: NextRequest) {
  // 5 requests per 15 minutes per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!checkRateLimit(`forgot-password:${ip}`, 5, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return SUCCESS_RESPONSE

  const email = parsed.data.email.toLowerCase()
  const result = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])
  const user = result.rows[0]

  if (user) {
    try {
      const token = await createPasswordResetToken(user.id)
      await sendPasswordResetEmail(email, token)
    } catch (err) {
      console.error('Password reset error:', err)
    }
  }

  return SUCCESS_RESPONSE
}
