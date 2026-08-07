'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useBusyWhile } from '@/components/BusyOverlay'

const schema = z.object({
  email: z.string().email('Invalid email address'),
})

type FormValues = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useBusyWhile(isSubmitting)

  async function onSubmit(values: FormValues) {
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: values.email }),
    })
    // Always show success regardless of response (prevents enumeration)
    setSubmitted(true)
  }

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
      <svg className="auth-page__motif auth-page__motif--quiet" width="220" height="170" viewBox="0 0 260 200" fill="none" stroke="#EEF3EA" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M40 110 a80 60 0 0 1 150 -20 h20 l-15 25 a80 60 0 0 1 -30 65 v20 h-20 v-15 h-60 v15 h-20 v-25 a80 60 0 0 1 -25 -65 z" />
        <line x1="150" y1="55" x2="150" y2="40" />
      </svg>
      <div className="auth-card">
        <h1>Reset password</h1>
        {submitted ? (
          <p className="auth-success">
            If that email is registered, you&apos;ll receive a reset link shortly.
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
            <div className="form-field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" {...register('email')} autoComplete="email" />
              {errors.email && <span className="field-error">{errors.email.message}</span>}
            </div>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
        <a href="/login" className="auth-link">
          Back to sign in
        </a>
      </div>
    </main>
  )
}
