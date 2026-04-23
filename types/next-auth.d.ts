import NextAuth from 'next-auth'
import { JWT } from 'next-auth/jwt'

type Role = 'admin' | 'partner_admin' | 'partner' | 'dependent'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      role: Role
    }
  }

  interface User {
    id: string
    email: string
    role: Role
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: Role
  }
}
