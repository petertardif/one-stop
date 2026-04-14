'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

type FormValues = z.infer<typeof schema>

export function LoginForm() {
  const router = useRouter()
  const [authError, setAuthError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setAuthError(null)
    const result = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    })

    if (result?.error) {
      setAuthError('Invalid email or password')
      return
    }

    router.push('/dashboard')
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

      {authError && <p className="auth-error">{authError}</p>}

      <button type="submit" disabled={isSubmitting} className="btn-primary">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
