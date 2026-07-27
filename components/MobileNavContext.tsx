'use client'

import { createContext, useContext, useMemo, useState } from 'react'

interface MobileNavValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const MobileNavContext = createContext<MobileNavValue | null>(null)

/**
 * Shared open/close state for the mobile navigation drawer. The hamburger
 * (Topbar) and the drawer + backdrop (Sidebar) are siblings under the server
 * layout, so their shared state lives here. Desktop is unaffected — the drawer
 * behavior is gated entirely by the `@media (max-width: 768px)` shell styles.
 */
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const value = useMemo<MobileNavValue>(
    () => ({ open, setOpen, toggle: () => setOpen((o) => !o) }),
    [open]
  )
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>
}

export function useMobileNav(): MobileNavValue {
  const ctx = useContext(MobileNavContext)
  if (!ctx) throw new Error('useMobileNav must be used within MobileNavProvider')
  return ctx
}
