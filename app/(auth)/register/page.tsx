import { RegisterForm } from './RegisterForm'

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { token?: string; hint?: string }
}) {
  const { token, hint } = searchParams

  if (!token) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>One Stop</h1>
          <p>This page requires an invitation link. Please contact the account administrator.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Create your account</h1>
        <RegisterForm token={token} emailHint={hint} />
      </div>
    </main>
  )
}
