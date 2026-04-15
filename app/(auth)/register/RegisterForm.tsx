'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'

const schema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

interface Props {
  token: string
  emailHint?: string
}

export function RegisterForm({ token, emailHint }: Props) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: emailHint ?? '' },
  })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email: values.email, password: values.password }),
    })

    if (!res.ok) {
      const data = await res.json()
      setServerError(data.error ?? 'Something went wrong')
      return
    }

    const data = await res.json()
    const next = encodeURIComponent(data.next ?? '/dashboard')
    router.push(`/login?next=${next}`)
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
        <input id="password" type="password" {...register('password')} autoComplete="new-password" />
        {errors.password && <span className="field-error">{errors.password.message}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="confirmPassword">Confirm password</label>
        <input id="confirmPassword" type="password" {...register('confirmPassword')} autoComplete="new-password" />
        {errors.confirmPassword && (
          <span className="field-error">{errors.confirmPassword.message}</span>
        )}
      </div>

      {serverError && <p className="auth-error">{serverError}</p>}

      <button type="submit" disabled={isSubmitting} className="btn-primary">
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}
