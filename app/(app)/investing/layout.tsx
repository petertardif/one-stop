import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getAppSettings } from '@/lib/settings'

export default async function InvestingLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  if (session.user.role !== 'admin') {
    const settings = await getAppSettings()
    const key = `investing_access_${session.user.role}`
    if (!settings[key]) redirect('/dashboard')
  }

  return <>{children}</>
}
