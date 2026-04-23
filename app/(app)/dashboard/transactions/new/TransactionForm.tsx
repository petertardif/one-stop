'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ErrorMessage } from '@/components/ErrorMessage'

const CATEGORIES = [
  'ALCOHOL', 'CAR', 'DOGS', 'ENTERTAINMENT', 'FINANCIAL', 'GAS', 'GIFTS',
  'GROCERIES', 'HEALTHCARE', 'HOUSE', 'INCOME', 'JOB RELATED', 'KIDS',
  'KIDS SPORTS', 'MONTHLY BILLS', 'OTHER', 'RESTAURANT', 'SHOPPING',
  'TAKEOUT', 'TRAVEL', 'XMAS',
]

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  type: z.enum(['income', 'expense']),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  category: z.string().optional(),
  description: z.string().optional(),
  account_id: z.string().uuid().optional().or(z.literal('')),
  check_number: z.string().optional(),
  budget_flagged: z.boolean().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Account {
  id: string
  name: string
  institution: string | null
  type: string
}

interface TransactionFormProps {
  accounts: Account[]
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function TransactionForm({ accounts }: TransactionFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: today(), type: 'expense', budget_flagged: false },
  })

  const type = watch('type')

  async function onSubmit(values: FormValues) {
    setServerError(null)
    const signedAmount = values.type === 'expense' ? -Math.abs(values.amount) : Math.abs(values.amount)

    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        amount: signedAmount,
        account_id: values.account_id || null,
        category: values.category || null,
        description: values.description || null,
        check_number: values.check_number || null,
        notes: values.notes || null,
        is_posted: true,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setServerError(data.error?.formErrors?.[0] ?? data.error ?? 'Something went wrong')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="account-form">
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="date">Date <span className="field-required">*</span></label>
          <input id="date" type="date" {...register('date')} />
          {errors.date && <span className="field-error">{errors.date.message}</span>}
        </div>

        <div className="form-field">
          <label>Type <span className="field-required">*</span></label>
          <div className="radio-group">
            <label className="radio-label">
              <input type="radio" value="expense" {...register('type')} /> Expense
            </label>
            <label className="radio-label">
              <input type="radio" value="income" {...register('type')} /> Income
            </label>
          </div>
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="amount">Amount <span className="field-required">*</span></label>
        <input
          id="amount"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          {...register('amount')}
          className={type === 'expense' ? 'input-negative' : 'input-positive'}
        />
        {errors.amount && <span className="field-error">{errors.amount.message}</span>}
      </div>

      <div className="form-field">
        <label htmlFor="category">Category</label>
        <select id="category" {...register('category')}>
          <option value="">Select a category…</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="description">Description</label>
        <input id="description" type="text" {...register('description')} placeholder="e.g. Grocery run" />
      </div>

      <div className="form-field">
        <label htmlFor="account_id">Account</label>
        <select id="account_id" {...register('account_id')}>
          <option value="">No account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}{a.institution ? ` — ${a.institution}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="check_number">Check #</label>
          <input id="check_number" type="text" {...register('check_number')} />
        </div>

        <div className="form-field form-field--checkbox">
          <label className="checkbox-label">
            <input type="checkbox" {...register('budget_flagged')} />
            Budget
          </label>
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" rows={2} {...register('notes')} />
      </div>

      {serverError && <ErrorMessage message={serverError} />}

      <div className="form-actions">
        <div className="form-actions__right">
          <button type="button" className="btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Log transaction'}
          </button>
        </div>
      </div>
    </form>
  )
}
