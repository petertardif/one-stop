import { ResetPasswordForm } from './ResetPasswordForm'

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const { token } = searchParams

  if (!token) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Reset password</h1>
          <p>This link is invalid or has expired. Please request a new one.</p>
          <a href="/forgot-password" className="auth-link">
            Request new link
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Set new password</h1>
        <ResetPasswordForm token={token} />
      </div>
    </main>
  )
}
