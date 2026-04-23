import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { CalculatorClient } from './CalculatorClient'

export default async function CalculatorPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  return (
    <div className="page-container page-container--wide">
      <h1 className="page-title">Big 5 Calculator</h1>
      <CalculatorClient isAdmin={session.user.role === 'admin'} />
    </div>
  )
}
