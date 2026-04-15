import NextAuth from 'next-auth'
import { JWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      role: 'admin' | 'partner' | 'dependent'
    }
  }

  interface User {
    id: string
    email: string
    role: 'admin' | 'partner' | 'dependent'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'admin' | 'partner' | 'dependent'
  }
}
