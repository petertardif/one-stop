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

  const port = Number(process.env.SMTP_PORT ?? 587)

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 587 negotiates STARTTLS instead
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Nodemailer's defaults are minutes long, but the serverless function is killed
    // after ~10s -- a hung connection would take the request down with it and log
    // nothing. Fail first so the real error reaches the logs.
    connectionTimeout: 7_000,
    greetingTimeout: 7_000,
    socketTimeout: 10_000,
  })
}

// Singleton
const globalForMailer = globalThis as unknown as { mailer?: nodemailer.Transporter }
export const mailer = globalForMailer.mailer ?? createTransport()
if (process.env.NODE_ENV !== 'production') globalForMailer.mailer = mailer

// Gmail (and most providers) reject a From address that is neither the authenticated
// account nor a verified alias, so fall back to the SMTP user rather than a placeholder
// on an unroutable .local domain that could never pass SPF/DMARC.
const FROM = process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? 'noreply@onestop.local'
const BASE_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// A bare URL in a text/plain body is only clickable if the mail client linkifies it, and
// these links run ~120 characters -- long enough that quoted-printable encoding inserts a
// soft line break mid-token. Clients that mishandle that produce a link with the query
// string truncated or dropped, which lands on the "invalid or has expired" page. Sending a
// real <a href> alongside the text part makes the link independent of all that.
function htmlBody(paragraphs: string[], url: string, label: string): string {
  return (
    paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('') +
    `<p><a href="${url}">${label}</a></p>` +
    `<p style="color:#666;font-size:12px">If that link doesn't work, copy and paste this into your browser:<br>${url}</p>`
  )
}

export async function sendInviteEmail(to: string, token: string): Promise<void> {
  const url = `${BASE_URL}/register?token=${token}&hint=${encodeURIComponent(to)}`
  const info = await mailer.sendMail({
    from: FROM,
    to,
    subject: "You've been invited to One Stop",
    text: `You've been invited to create an account on One Stop.\n\nClick the link below to get started (expires in 72 hours):\n\n${url}\n\nIf you didn't expect this email, you can ignore it.`,
    html: htmlBody(
      [
        "You've been invited to create an account on One Stop.",
        'Use the link below to get started. It expires in 72 hours.',
        "If you didn't expect this email, you can ignore it.",
      ],
      url,
      'Create your account'
    ),
  })

  if (process.env.NODE_ENV !== 'production') {
    console.log('Invite email preview:', nodemailer.getTestMessageUrl(info))
  }
}

// Notify the admin the moment a recipient confirms the death gate (irreversible,
// triggers Goodbyes delivery). `confirmerName` is a best-effort display label.
export async function sendDeathTriggerEmail(to: string, confirmerName: string): Promise<void> {
  const url = `${BASE_URL}/contingency/messages`
  const info = await mailer.sendMail({
    from: FROM,
    to,
    subject: 'One Stop — your Goodbyes have been triggered',
    text: `${confirmerName} just confirmed the "has passed away" gate in One Stop, so your Goodbyes messages are now being delivered.\n\nIf this was a mistake, sign in and reset the death status here:\n\n${url}`,
    html: htmlBody(
      [
        `${confirmerName} just confirmed the "has passed away" gate in One Stop, so your Goodbyes messages are now being delivered.`,
        'If this was a mistake, sign in and reset the death status.',
      ],
      url,
      'Review death status'
    ),
  })

  if (process.env.NODE_ENV !== 'production') {
    console.log('Death-trigger email preview:', nodemailer.getTestMessageUrl(info))
  }
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${BASE_URL}/reset-password?token=${token}`
  const info = await mailer.sendMail({
    from: FROM,
    to,
    subject: 'Reset your One Stop password',
    text: `You requested a password reset for your One Stop account.\n\nClick the link below to set a new password (expires in 30 minutes):\n\n${url}\n\nIf you didn't request this, you can ignore it.`,
    html: htmlBody(
      [
        'You requested a password reset for your One Stop account.',
        'Use the link below to set a new password. It expires in 30 minutes.',
        "If you didn't request this, you can ignore it.",
      ],
      url,
      'Set a new password'
    ),
  })

  if (process.env.NODE_ENV !== 'production') {
    console.log('Password reset email preview:', nodemailer.getTestMessageUrl(info))
  }
}
