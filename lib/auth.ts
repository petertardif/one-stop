import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { query } from './db'

interface UserRow {
  id: string
  email: string
  password_hash: string
  role: 'admin' | 'spouse'
}

export async function authorizeUser(
  email: string,
  password: string
): Promise<{ id: string; email: string; role: 'admin' | 'spouse' } | null> {
  const result = await query<UserRow>(
    'SELECT id, email, password_hash, role FROM users WHERE email = $1',
    [email.toLowerCase()]
  )

  const user = result.rows[0]
  if (!user) return null

  const passwordValid = await bcrypt.compare(password, user.password_hash)
  if (!passwordValid) return null

  return { id: user.id, email: user.email, role: user.role }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        return authorizeUser(credentials.email, credentials.password)
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
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
