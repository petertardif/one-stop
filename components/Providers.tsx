'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { Session } from 'next-auth'
import { useState } from 'react'
import { ToastProvider } from '@/components/Toast'
import { BusyProvider } from '@/components/BusyOverlay'
import { MobileNavProvider } from '@/components/MobileNavContext'

export function Providers({ children, session }: { children: React.ReactNode; session: Session | null }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
        <BusyProvider>
          <MobileNavProvider>
            <ToastProvider>{children}</ToastProvider>
          </MobileNavProvider>
        </BusyProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
