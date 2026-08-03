'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { ErrorMessage } from '@/components/ErrorMessage'
import { passwordSchema, PASSWORD_RULES } from '@/lib/password'

const schema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: values.password }),
    })

    if (!res.ok) {
      const data = await res.json()
      setServerError(data.error ?? 'Something went wrong')
      return
    }

    router.push('/login?message=password-updated')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
      <div className="form-field">
        <label htmlFor="password">New password</label>
        <input id="password" type="password" {...register('password')} autoComplete="new-password" />
        {errors.password && <span className="field-error">{errors.password.message}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="confirmPassword">Confirm new password</label>
        <input id="confirmPassword" type="password" {...register('confirmPassword')} autoComplete="new-password" />
        {errors.confirmPassword && (
          <span className="field-error">{errors.confirmPassword.message}</span>
        )}
      </div>

      <ul className="password-rules">
        {PASSWORD_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      {serverError && <ErrorMessage message={serverError} />}

      <button type="submit" disabled={isSubmitting} className="btn-primary">
        {isSubmitting ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  )
}
