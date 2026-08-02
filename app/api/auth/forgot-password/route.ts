import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query } from '@/lib/db'
import { createPasswordResetToken } from '@/lib/tokens'
import { sendPasswordResetEmail } from '@/lib/email'
import { checkRateLimit } from '@/lib/rateLimit'

const bodySchema = z.object({
  email: z.string().email(),
})

// Always return the same response to prevent user enumeration. This must build a fresh
// NextResponse per call -- a Response body is a single-use stream, so returning one shared
// instance would serve an already-consumed body on later requests in a warm container.
function successResponse() {
  return NextResponse.json(
    { message: "If that email is registered, you'll receive a reset link shortly." },
    { status: 200 }
  )
}

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
  if (!parsed.success) return successResponse()

  const email = parsed.data.email.toLowerCase()
  const result = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])
  const user = result.rows[0]

  if (user) {
    try {
      const token = await createPasswordResetToken(user.id)
      await sendPasswordResetEmail(email, token)
    } catch (err) {
      // The HTTP response is identical either way, so this log is the only signal that a
      // send failed. Record the SMTP code/response -- "no email arrived" is otherwise
      // indistinguishable from success.
      const e = err as { code?: string; responseCode?: number; response?: string; message?: string }
      console.error('[forgot-password] send failed', {
        code: e.code,
        responseCode: e.responseCode,
        response: e.response,
        message: e.message,
      })
    }
  } else {
    console.warn('[forgot-password] no user matched the submitted address')
  }

  return successResponse()
}
