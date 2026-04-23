import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { query } from './db'
import { checkIpRateLimit } from './rate-limit'

const LOCK_THRESHOLD = 5
const LOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes

type Role = 'admin' | 'partner_admin' | 'partner' | 'dependent'

interface UserRow {
  id: string
  email: string
  password_hash: string
  role: Role
  failed_login_attempts: number
  locked_until: Date | null
}

export async function authorizeUser(
  email: string,
  password: string,
  ip?: string
): Promise<{ id: string; email: string; role: Role } | string> {
  // IP-based rate limit
  if (ip) {
    const { allowed } = checkIpRateLimit(ip)
    if (!allowed) {
      return 'TOO_MANY_REQUESTS'
    }
  }

  const result = await query<UserRow>(
    'SELECT id, email, password_hash, role, failed_login_attempts, locked_until FROM users WHERE email = $1',
    [email.toLowerCase()]
  )

  const user = result.rows[0]
  if (!user) return 'INVALID_CREDENTIALS'

  // Account lockout check
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return 'ACCOUNT_LOCKED'
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash)

  if (!passwordValid) {
    const newAttempts = user.failed_login_attempts + 1
    if (newAttempts >= LOCK_THRESHOLD) {
      await query(
        'UPDATE users SET failed_login_attempts = $1, locked_until = $2, updated_at = NOW() WHERE id = $3',
        [newAttempts, new Date(Date.now() + LOCK_DURATION_MS), user.id]
      )
      return 'ACCOUNT_LOCKED'
    }
    await query(
      'UPDATE users SET failed_login_attempts = $1, updated_at = NOW() WHERE id = $2',
      [newAttempts, user.id]
    )
    return 'INVALID_CREDENTIALS'
  }

  // Success — reset lockout state
  await query(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1',
    [user.id]
  )

  return { id: user.id, email: user.email, role: user.role }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        ip: { label: 'IP', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const result = await authorizeUser(
          credentials.email,
          credentials.password,
          credentials.ip || undefined
        )

        if (typeof result === 'string') {
          // Encode the error code as a special marker NextAuth will pass through
          throw new Error(result)
        }

        return result
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}
