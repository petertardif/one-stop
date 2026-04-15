'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'

const schema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().max(100).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  address_line1: z.string().max(200).optional(),
  address_line2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postal_code: z.string().max(20).optional(),
  country: z.string().max(2).optional(),
})

type FormValues = z.infer<typeof schema>

interface Profile {
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
}

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: profile?.first_name ?? '',
      last_name: profile?.last_name ?? '',
      date_of_birth: profile?.date_of_birth?.slice(0, 10) ?? '',
      phone: profile?.phone ?? '',
      address_line1: profile?.address_line1 ?? '',
      address_line2: profile?.address_line2 ?? '',
      city: profile?.city ?? '',
      state: profile?.state ?? '',
      postal_code: profile?.postal_code ?? '',
      country: profile?.country ?? 'US',
    },
  })

  async function onSubmit(values: FormValues) {
    setServerError(null)

    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        date_of_birth: values.date_of_birth || null,
        phone: values.phone || null,
        address_line1: values.address_line1 || null,
        address_line2: values.address_line2 || null,
        city: values.city || null,
        state: values.state || null,
        postal_code: values.postal_code || null,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setServerError(data.error ?? 'Failed to save profile')
      return
    }

    router.push('/dashboard')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="profile-form">
      <section className="form-section">
        <h2>Personal</h2>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="first_name">First name</label>
            <input id="first_name" type="text" {...register('first_name')} autoComplete="given-name" />
            {errors.first_name && <span className="field-error">{errors.first_name.message}</span>}
          </div>
          <div className="form-field">
            <label htmlFor="last_name">Last name</label>
            <input id="last_name" type="text" {...register('last_name')} autoComplete="family-name" />
            {errors.last_name && <span className="field-error">{errors.last_name.message}</span>}
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="date_of_birth">Date of birth</label>
            <input id="date_of_birth" type="date" {...register('date_of_birth')} />
            {errors.date_of_birth && <span className="field-error">{errors.date_of_birth.message}</span>}
          </div>
          <div className="form-field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" type="tel" {...register('phone')} autoComplete="tel" />
          </div>
        </div>
      </section>

      <section className="form-section">
        <h2>Address</h2>
        <div className="form-field">
          <label htmlFor="address_line1">Address line 1</label>
          <input id="address_line1" type="text" {...register('address_line1')} autoComplete="address-line1" />
        </div>
        <div className="form-field">
          <label htmlFor="address_line2">Address line 2</label>
          <input id="address_line2" type="text" {...register('address_line2')} autoComplete="address-line2" />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="city">City</label>
            <input id="city" type="text" {...register('city')} autoComplete="address-level2" />
          </div>
          <div className="form-field">
            <label htmlFor="state">State</label>
            <input id="state" type="text" {...register('state')} autoComplete="address-level1" />
          </div>
          <div className="form-field form-field--narrow">
            <label htmlFor="postal_code">ZIP code</label>
            <input id="postal_code" type="text" {...register('postal_code')} autoComplete="postal-code" />
          </div>
        </div>

        <div className="form-field form-field--narrow">
          <label htmlFor="country">Country</label>
          <input id="country" type="text" maxLength={2} {...register('country')} autoComplete="country" />
        </div>
      </section>

      {serverError && <p className="auth-error">{serverError}</p>}

      <button type="submit" disabled={isSubmitting || !isDirty} className="btn-primary">
        {isSubmitting ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  )
}
