import { z } from 'zod'

// bcrypt hashes at most 72 bytes and silently ignores everything past that, so a longer
// passphrase would be weaker than it looks. Reject it outright instead.
export const MAX_PASSWORD_BYTES = 72
export const MIN_PASSWORD_LENGTH = 12

// TextEncoder (not Buffer) so the same schema runs in the browser and on the server.
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

export const PASSWORD_RULES = [
  `At least ${MIN_PASSWORD_LENGTH} characters`,
  'An uppercase letter',
  'A lowercase letter',
  'A number',
  'A special character',
] as const

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .refine((v) => /[A-Z]/.test(v), 'Password must contain an uppercase letter')
  .refine((v) => /[a-z]/.test(v), 'Password must contain a lowercase letter')
  .refine((v) => /[0-9]/.test(v), 'Password must contain a number')
  .refine(
    (v) => /[^A-Za-z0-9]/.test(v),
    'Password must contain a special character'
  )
  .refine(
    (v) => byteLength(v) <= MAX_PASSWORD_BYTES,
    `Password must be at most ${MAX_PASSWORD_BYTES} bytes (emoji and accented characters count as several)`
  )
