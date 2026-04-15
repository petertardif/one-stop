import crypto from 'crypto'
import { query } from './db'

export type Role = 'admin' | 'partner' | 'dependent'

interface InviteTokenRow {
  id: string
  token: string
  invited_by: string
  role: Role
  email_hint: string | null
  used_at: Date | null
  expires_at: Date
}

interface PasswordResetTokenRow {
  id: string
  token: string
  user_id: string
  used_at: Date | null
  expires_at: Date
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// --- Invite tokens ---

export async function createInviteToken(
  invitedBy: string,
  role: Role,
  emailHint?: string
): Promise<string> {
  const token = generateSecureToken()
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000) // 72 hours

  await query(
    `INSERT INTO invite_tokens (token, invited_by, role, email_hint, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [token, invitedBy, role, emailHint ?? null, expiresAt]
  )

  return token
}

export async function validateInviteToken(token: string): Promise<InviteTokenRow | null> {
  const result = await query<InviteTokenRow>(
    `SELECT * FROM invite_tokens
     WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [token]
  )
  return result.rows[0] ?? null
}

export async function consumeInviteToken(token: string): Promise<void> {
  await query(
    `UPDATE invite_tokens SET used_at = NOW() WHERE token = $1`,
    [token]
  )
}

// --- Password reset tokens ---

export async function createPasswordResetToken(userId: string): Promise<string> {
  // Invalidate any existing unused tokens for this user
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  )

  const token = generateSecureToken()
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

  await query(
    `INSERT INTO password_reset_tokens (token, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  )

  return token
}

export async function validatePasswordResetToken(
  token: string
): Promise<PasswordResetTokenRow | null> {
  const result = await query<PasswordResetTokenRow>(
    `SELECT * FROM password_reset_tokens
     WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [token]
  )
  return result.rows[0] ?? null
}

export async function consumePasswordResetToken(token: string): Promise<void> {
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1`,
    [token]
  )
}
