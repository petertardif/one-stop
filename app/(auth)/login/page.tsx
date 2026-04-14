import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { LoginForm } from './LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { message?: string }
}) {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>One Stop</h1>
        {searchParams.message === 'password-updated' && (
          <p className="auth-success">Password updated. Please sign in.</p>
        )}
        <LoginForm />
        <a href="/forgot-password" className="auth-link">
          Forgot password?
        </a>
      </div>
    </main>
  )
}
