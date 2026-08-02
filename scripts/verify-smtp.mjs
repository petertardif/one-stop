// Standalone SMTP checker -- prints the raw SMTP error instead of swallowing it the way
// the app routes do (they stay silent on purpose, to avoid user enumeration).
//
//   npm run email:check -- recipient@example.com
//   node --env-file=.env scripts/verify-smtp.mjs recipient@example.com
//
// Transport options are kept in sync with createTransport() in lib/email.ts.

import nodemailer from 'nodemailer'

const to = process.argv[2]
if (!to) {
  console.error('usage: npm run email:check -- <recipient@example.com>')
  process.exit(1)
}

const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !process.env[k])
if (missing.length) {
  console.error(`missing env vars: ${missing.join(', ')}`)
  console.error('(run with --env-file=.env, or use `npm run email:check`)')
  process.exit(1)
}

const port = Number(process.env.SMTP_PORT ?? 587)
const from = process.env.EMAIL_FROM ?? process.env.SMTP_USER

console.log(`host  ${process.env.SMTP_HOST}:${port} (secure=${port === 465})`)
console.log(`user  ${process.env.SMTP_USER}`)
console.log(`from  ${from}`)
console.log(`to    ${to}\n`)

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 7_000,
  greetingTimeout: 7_000,
  socketTimeout: 10_000,
})

function hintFor(err) {
  const response = String(err.response ?? '')
  if (err.responseCode === 535 || response.includes('5.7.8')) {
    return 'Auth rejected. SMTP_PASS must be a Google App Password (16 chars, no spaces) -- Gmail no longer accepts account passwords.'
  }
  if (err.responseCode === 553 || response.includes('5.7.60')) {
    return `From address not allowed. Gmail requires EMAIL_FROM to be ${process.env.SMTP_USER} or a verified "Send mail as" alias -- currently "${from}".`
  }
  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKET' || err.code === 'ECONNREFUSED') {
    return 'Could not reach the SMTP host. Check SMTP_HOST/SMTP_PORT and outbound network access.'
  }
  return null
}

try {
  await transporter.verify()
  console.log('verify() OK -- connection and credentials accepted')

  const info = await transporter.sendMail({
    from,
    to,
    subject: 'One Stop SMTP check',
    text: 'If you are reading this, One Stop can send mail.',
  })

  console.log(`sent    messageId: ${info.messageId}`)
  console.log(`        response : ${info.response}`)
  console.log(`        accepted : ${JSON.stringify(info.accepted)}`)
  if (info.rejected?.length) console.log(`        REJECTED : ${JSON.stringify(info.rejected)}`)
} catch (err) {
  console.error('\nFAILED')
  console.error(`  code         : ${err.code}`)
  console.error(`  responseCode : ${err.responseCode}`)
  console.error(`  response     : ${err.response}`)
  console.error(`  message      : ${err.message}`)
  const hint = hintFor(err)
  if (hint) console.error(`\n  -> ${hint}`)
  process.exit(1)
}
