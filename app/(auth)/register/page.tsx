import { RegisterForm } from './RegisterForm'

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { token?: string; hint?: string }
}) {
  const { token, hint } = searchParams

  const wordmark = (
    <a href="/" className="auth-page__wordmark">
      <span className="auth-page__mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="9,2 15,7 3,7" />
          <rect x="4" y="7" width="10" height="8" />
        </svg>
      </span>
      <span className="auth-page__wordmark-text">One Stop</span>
    </a>
  )

  const motif = (
    <svg className="auth-page__motif auth-page__motif--quiet" width="220" height="170" viewBox="0 0 260 200" fill="none" stroke="#EEF3EA" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M40 110 a80 60 0 0 1 150 -20 h20 l-15 25 a80 60 0 0 1 -30 65 v20 h-20 v-15 h-60 v15 h-20 v-25 a80 60 0 0 1 -25 -65 z" />
      <line x1="150" y1="55" x2="150" y2="40" />
    </svg>
  )

  if (!token) {
    return (
      <main className="auth-page">
        {wordmark}
        {motif}
        <div className="auth-card">
          <h1>One Stop</h1>
          <p>This page requires an invitation link. Please contact the account administrator.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-page">
      {wordmark}
      {motif}
      <div className="auth-card">
        <h1>Create your account</h1>
        <RegisterForm token={token} emailHint={hint} />
      </div>
      <p className="auth-page__caption">A guide for your family, ready when they need it.</p>
    </main>
  )
}
