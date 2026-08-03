import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const role = req.nextauth.token?.role

    if (pathname.startsWith('/settings') && role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => token != null,
    },
    pages: {
      signIn: '/login',
    },
  }
)

export const config = {
  matcher: [
    // Static assets in public/ must be excluded by extension, not by name. Listing only
    // `favicon.ico` (which does not exist) meant real icon requests -- favicon.svg,
    // favicon-32.png, apple-touch-icon.png, manifest.webmanifest -- were treated as app
    // routes and 307'd to /login, so the browser got HTML where it expected an image.
    '/((?!login|register|forgot-password|reset-password|api/auth|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
