'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ErrorMessage } from '@/components/ErrorMessage'
import { useBusyWhile, useBusyHold, AUTH_REDIRECT_HOLD } from '@/components/BusyOverlay'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

type FormValues = z.infer<typeof schema>

const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_LOCKED: 'This account has been locked due to too many failed attempts. Try again in 15 minutes.',
  TOO_MANY_REQUESTS: 'Too many sign-in attempts from this device. Please wait 15 minutes and try again.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter()
  const [authError, setAuthError] = useState<string | null>(null)
  const { hold } = useBusyHold()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  // Covers the credential check itself; the hold below covers the redirect that follows.
  useBusyWhile(isSubmitting)

  async function onSubmit(values: FormValues) {
    setAuthError(null)

    let ip: string | undefined
    try {
      const res = await fetch('https://api.ipify.org?format=json')
      const data = await res.json()
      ip = data.ip
    } catch {
      // proceed without IP — server-side rate limiting will still work per-account
    }

    const result = await signIn('credentials', {
      email: values.email,
      password: values.password,
      ip: ip ?? '',
      redirect: false,
    })

    if (result?.error) {
      const code = result.error
      setAuthError(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.INVALID_CREDENTIALS)
      return
    }

    // A hold rather than useBusyWhile: this component unmounts on redirect, which would
    // release the spinner and leave a blank gap while the destination loads. The
    // destination clears it via AUTH_REDIRECT_HOLD once its own data is ready.
    hold(AUTH_REDIRECT_HOLD)
    router.push(next ?? '/dashboard')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
      <div className="form-field">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" {...register('email')} autoComplete="email" />
        {errors.email && <span className="field-error">{errors.email.message}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="password">Password</label>
        <input id="password" type="password" {...register('password')} autoComplete="current-password" />
        {errors.password && <span className="field-error">{errors.password.message}</span>}
      </div>

      {authError && <ErrorMessage message={authError} />}

      <button type="submit" disabled={isSubmitting} className="btn-primary">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
