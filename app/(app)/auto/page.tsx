import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AutoTable } from './AutoTable'

export default async function AutoPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <main>
      <AutoTable role={session.user.role} />
    </main>
  )
}
