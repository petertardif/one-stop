'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ErrorMessage } from '@/components/ErrorMessage'
import { useToast } from '@/components/Toast'
import { useBusyWhile } from '@/components/BusyOverlay'
import { passwordSchema, PASSWORD_RULES } from '@/lib/password'

const schema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: passwordSchema,
    confirm_password: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'New passwords do not match',
    path: ['confirm_password'],
  })

type FormValues = z.infer<typeof schema>

export function ChangePasswordForm() {
  const { showToast } = useToast()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useBusyWhile(isSubmitting)

  async function onSubmit(values: FormValues) {
    setServerError(null)

    const res = await fetch('/api/profile/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })

    if (!res.ok) {
      const data = await res.json()
      setServerError(data.error ?? 'Failed to change password')
      return
    }

    reset()
    showToast('Password changed. A confirmation email is on its way.', 'success')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="profile-form">
      <section className="form-section">
        <h2>Change password</h2>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="current_password">Current password</label>
            <input
              id="current_password"
              type="password"
              autoComplete="current-password"
              {...register('current_password')}
            />
            {errors.current_password && (
              <span className="field-error">{errors.current_password.message}</span>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="new_password">New password</label>
            <input
              id="new_password"
              type="password"
              autoComplete="new-password"
              {...register('new_password')}
            />
            {errors.new_password && (
              <span className="field-error">{errors.new_password.message}</span>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="confirm_password">Confirm new password</label>
            <input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              {...register('confirm_password')}
            />
            {errors.confirm_password && (
              <span className="field-error">{errors.confirm_password.message}</span>
            )}
          </div>
        </div>

        <ul className="password-rules">
          {PASSWORD_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>

        {serverError && <ErrorMessage message={serverError} />}

        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Changing…' : 'Change password'}
        </button>
      </section>
    </form>
  )
}
