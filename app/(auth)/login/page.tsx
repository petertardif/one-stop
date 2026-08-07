import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { LoginForm } from './LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { message?: string; next?: string }
}) {
  const session = await getServerSession(authOptions)
  if (session) redirect(searchParams.next ?? '/dashboard')

  return (
    <main className="auth-page">
      <a href="/" className="auth-page__wordmark">
        <span className="auth-page__mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="9,2 15,7 3,7" />
            <rect x="4" y="7" width="10" height="8" />
          </svg>
        </span>
        <span className="auth-page__wordmark-text">One Stop</span>
      </a>
      <svg className="auth-page__motif" width="220" height="170" viewBox="0 0 260 200" fill="none" stroke="#EEF3EA" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M40 110 a80 60 0 0 1 150 -20 h20 l-15 25 a80 60 0 0 1 -30 65 v20 h-20 v-15 h-60 v15 h-20 v-25 a80 60 0 0 1 -25 -65 z" />
        <line x1="150" y1="55" x2="150" y2="40" />
      </svg>
      <div className="auth-card">
        <h1>One Stop</h1>
        {searchParams.message === 'password-updated' && (
          <p className="auth-success">Password updated. Please sign in.</p>
        )}
        <LoginForm next={searchParams.next} />
        <a href="/forgot-password" className="auth-link">
          Forgot password?
        </a>
      </div>
      <p className="auth-page__caption">A single, steady place for your family&apos;s finances.</p>
    </main>
  )
}
