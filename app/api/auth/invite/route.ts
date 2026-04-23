import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { createInviteToken } from '@/lib/tokens'
import { sendInviteEmail } from '@/lib/email'
import { query } from '@/lib/db'

const bodySchema = z.object({
  emailHint: z.string().email().optional(),
  role: z.enum(['partner_admin', 'partner', 'dependent']),
  force: z.boolean().optional().default(false),
  resend: z.boolean().optional().default(false),
})

interface ActiveInviteRow {
  id: string
  token: string
  role: string
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { emailHint, role, force, resend } = parsed.data

    // Check for an existing active invite for this email
    if (emailHint) {
      const existing = await query<ActiveInviteRow>(
        `SELECT id, token, role FROM invite_tokens
         WHERE email_hint = $1 AND used_at IS NULL AND expires_at > NOW()
         LIMIT 1`,
        [emailHint]
      )

      const existingInvite = existing.rows[0]

      if (existingInvite) {
        if (existingInvite.role === role) {
          if (!resend) {
            return NextResponse.json(
              { error: 'DUPLICATE_INVITE', message: 'An active invite already exists for this email.' },
              { status: 409 }
            )
          }
          // resend=true: re-send the existing invite email without creating a new token
          const hint = `&hint=${encodeURIComponent(emailHint)}`
          const inviteUrl = `${process.env.NEXTAUTH_URL}/register?token=${existingInvite.token}${hint}`
          let emailSent = false
          try {
            await sendInviteEmail(emailHint, existingInvite.token)
            emailSent = true
          } catch (emailErr) {
            console.error('Failed to resend invite email:', emailErr)
          }
          return NextResponse.json({ inviteUrl, emailSent }, { status: 200 })
        }

        if (!force) {
          return NextResponse.json(
            {
              error: 'ROLE_CONFLICT',
              existingRole: existingInvite.role,
              message: `This email already has an active invite as ${existingInvite.role}.`,
            },
            { status: 409 }
          )
        }

        await query(`UPDATE invite_tokens SET role = $1 WHERE id = $2`, [role, existingInvite.id])
        const hint = emailHint ? `&hint=${encodeURIComponent(emailHint)}` : ''
        const inviteUrl = `${process.env.NEXTAUTH_URL}/register?token=${existingInvite.token}${hint}`
        let emailSent = false
        try {
          await sendInviteEmail(emailHint, existingInvite.token)
          emailSent = true
        } catch (emailErr) {
          console.error('Failed to send invite email:', emailErr)
        }
        return NextResponse.json({ inviteUrl, emailSent }, { status: 200 })
      }
    }

    const token = await createInviteToken(session.user.id, role, emailHint)
    const hint = emailHint ? `&hint=${encodeURIComponent(emailHint)}` : ''
    const inviteUrl = `${process.env.NEXTAUTH_URL}/register?token=${token}${hint}`

    let emailSent = false
    if (emailHint) {
      try {
        await sendInviteEmail(emailHint, token)
        emailSent = true
      } catch (emailErr) {
        console.error('Failed to send invite email:', emailErr)
      }
    }

    return NextResponse.json({ inviteUrl, emailSent }, { status: 201 })
  } catch (err) {
    console.error('POST /api/auth/invite error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
