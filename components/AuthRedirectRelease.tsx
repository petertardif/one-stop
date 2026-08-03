'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useBusyHold, AUTH_REDIRECT_HOLD } from '@/components/BusyOverlay'

/**
 * Clears the sign-in hold once the destination has mounted.
 *
 * The dashboard is excluded because it releases the hold itself, after its data resolves —
 * that is the "wait until the dashboard is ready" case. Every other destination (a
 * `?next=` deep link from the middleware, for instance) releases here on mount, handing
 * over to whatever inline spinner that page already renders while it loads.
 */
export function AuthRedirectRelease() {
  const pathname = usePathname()
  const { releaseHold } = useBusyHold()

  useEffect(() => {
    if (pathname !== '/dashboard') releaseHold(AUTH_REDIRECT_HOLD)
  }, [pathname, releaseHold])

  return null
}
