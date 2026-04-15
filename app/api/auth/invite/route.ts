import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { createInviteToken } from '@/lib/tokens'
import { sendInviteEmail } from '@/lib/email'

const bodySchema = z.object({
  emailHint: z.string().email().optional(),
})

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

  const { emailHint } = parsed.data
  const token = await createInviteToken(session.user.id, 'partner', emailHint)

  const hint = emailHint ? `&hint=${encodeURIComponent(emailHint)}` : ''
  const inviteUrl = `${process.env.NEXTAUTH_URL}/register?token=${token}${hint}`

  if (emailHint) {
    try {
      await sendInviteEmail(emailHint, token)
    } catch (err) {
      console.error('Failed to send invite email:', err)
      // Non-fatal — admin can copy the URL manually
    }
  }

  return NextResponse.json({ inviteUrl }, { status: 201 })
}
