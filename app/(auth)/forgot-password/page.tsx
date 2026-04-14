'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

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
