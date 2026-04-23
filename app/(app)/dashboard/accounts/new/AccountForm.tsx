'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ErrorMessage } from '@/components/ErrorMessage'

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'investment', label: 'Investment' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'retirement', label: 'Retirement (401k / IRA)' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'car_loan', label: 'Car Loan' },
  { value: 'student_loan', label: 'Student Loan' },
  { value: 'other_debt', label: 'Other Debt' },
] as const

const DEBT_TYPES = ['credit_card', 'mortgage', 'car_loan', 'student_loan', 'other_debt']

const schema = z.object({
  name: z.string().min(1, 'Account name is required'),
  institution: z.string().optional(),
  type: z.enum([
    'checking', 'savings', 'investment', 'brokerage', 'retirement',
    'real_estate', 'credit_card', 'mortgage', 'car_loan', 'student_loan', 'other_debt',
  ], { required_error: 'Account type is required' }),
  balance: z.coerce.number(),
  interest_rate: z.coerce.number().min(0).max(100).optional().nullable(),
  minimum_payment: z.coerce.number().min(0).optional().nullable(),
})

type FormValues = z.infer<typeof schema>

export interface Account {
  id: string
  name: string
  institution: string | null
  type: string
  balance: string
  interest_rate: string | null
  minimum_payment: string | null
}

interface AccountFormProps {
  mode: 'create' | 'edit'
  account?: Account
  selectedType?: string
}

export function AccountForm({ mode, account }: AccountFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: account?.name ?? '',
      institution: account?.institution ?? '',
      type: (account?.type as FormValues['type']) ?? undefined,
      balance: account ? parseFloat(account.balance) : 0,
      interest_rate: account?.interest_rate ? parseFloat(account.interest_rate) : null,
      minimum_payment: account?.minimum_payment ? parseFloat(account.minimum_payment) : null,
    },
  })

  const watchedType = watch('type')
  const isDebt = DEBT_TYPES.includes(watchedType)

  async function onSubmit(values: FormValues) {
    setServerError(null)
    const url = mode === 'create' ? '/api/accounts' : `/api/accounts/${account!.id}`
    const method = mode === 'create' ? 'POST' : 'PUT'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })

    if (!res.ok) {
      const data = await res.json()
      setServerError(data.error?.formErrors?.[0] ?? data.error ?? 'Something went wrong')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleDelete() {
    if (!account || !confirm(`Delete "${account.name}"? This cannot be undone.`)) return
    setDeleting(true)
    const res = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      setServerError(data.error ?? 'Delete failed')
      setDeleting(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="account-form">
      <div className="form-field">
        <label htmlFor="name">Account name <span className="field-required">*</span></label>
        <input id="name" type="text" {...register('name')} placeholder="e.g. Chase Checking" />
        {errors.name && <span className="field-error">{errors.name.message}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="institution">Institution</label>
        <input id="institution" type="text" {...register('institution')} placeholder="e.g. Chase Bank" />
      </div>

      <div className="form-field">
        <label htmlFor="type">Account type <span className="field-required">*</span></label>
        <select id="type" {...register('type')}>
          <option value="">Select a type…</option>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {errors.type && <span className="field-error">{errors.type.message}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="balance">Current balance</label>
        <input id="balance" type="number" step="0.01" {...register('balance')} />
        <span className="field-hint">For debt accounts, enter a negative value (e.g. -5000)</span>
      </div>

      {isDebt && (
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="interest_rate">Interest rate (%)</label>
            <input id="interest_rate" type="number" step="0.01" min="0" max="100" {...register('interest_rate')} placeholder="e.g. 19.99" />
          </div>
          <div className="form-field">
            <label htmlFor="minimum_payment">Minimum payment ($)</label>
            <input id="minimum_payment" type="number" step="0.01" min="0" {...register('minimum_payment')} placeholder="e.g. 25.00" />
          </div>
        </div>
      )}

      {serverError && <ErrorMessage message={serverError} />}

      <div className="form-actions">
        {mode === 'edit' && (
          <button
            type="button"
            className="btn-danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </button>
        )}
        <div className="form-actions__right">
          <button type="button" className="btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : mode === 'create' ? 'Add account' : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  )
}
