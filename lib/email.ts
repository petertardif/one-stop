import nodemailer from 'nodemailer'

function createTransport() {
  if (process.env.NODE_ENV === 'test') {
    // Ethereal — fake SMTP, no real sends. Logs a preview URL to the console.
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: process.env.ETHEREAL_USER ?? '',
        pass: process.env.ETHEREAL_PASS ?? '',
      },
    })
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

// Singleton
const globalForMailer = globalThis as unknown as { mailer?: nodemailer.Transporter }
export const mailer = globalForMailer.mailer ?? createTransport()
if (process.env.NODE_ENV !== 'production') globalForMailer.mailer = mailer

const FROM = process.env.EMAIL_FROM ?? 'noreply@onestop.local'
const BASE_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

export async function sendInviteEmail(to: string, token: string): Promise<void> {
  const url = `${BASE_URL}/register?token=${token}&hint=${encodeURIComponent(to)}`
  const info = await mailer.sendMail({
    from: FROM,
    to,
    subject: "You've been invited to One Stop",
    text: `You've been invited to create an account on One Stop.\n\nClick the link below to get started (expires in 72 hours):\n\n${url}\n\nIf you didn't expect this email, you can ignore it.`,
  })

  if (process.env.NODE_ENV !== 'production') {
    console.log('Invite email preview:', nodemailer.getTestMessageUrl(info))
  }
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${BASE_URL}/reset-password?token=${token}`
  const info = await mailer.sendMail({
    from: FROM,
    to,
    subject: 'Reset your One Stop password',
    text: `You requested a password reset for your One Stop account.\n\nClick the link below to set a new password (expires in 30 minutes):\n\n${url}\n\nIf you didn't request this, you can ignore it.`,
  })

  if (process.env.NODE_ENV !== 'production') {
    console.log('Password reset email preview:', nodemailer.getTestMessageUrl(info))
  }
}
