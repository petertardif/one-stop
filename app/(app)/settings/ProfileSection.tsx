'use client'

import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { X, ChevronDown, Pencil } from 'lucide-react'
import { ErrorMessage } from '@/components/ErrorMessage'

function isRealPastDate(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false
  const [y, m, d] = val.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d &&
    date < new Date()
  )
}

function formatPhone(val: string | null | undefined): string {
  if (!val) return '—'
  const digits = val.replace(/\D/g, '')
  if (digits.length !== 10) return val
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

const schema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().max(100).optional(),
  date_of_birth: z.union([
    z.literal(''),
    z.string().refine(isRealPastDate, 'Must be a valid date in the past'),
  ]).optional(),
  phone: z.union([
    z.literal(''),
    z.string().refine(
      val => val.replace(/\D/g, '').length === 10,
      'Phone number must be 10 digits'
    ),
  ]).optional(),
  address_line1: z.string().max(200).optional(),
  address_line2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postal_code: z.string().max(20).optional(),
  country: z.string().max(2).optional(),
})

type FormValues = z.infer<typeof schema>

function toDateString(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  return val.toISOString().slice(0, 10)
}

export interface Profile {
  first_name: string | null
  last_name: string | null
  date_of_birth: string | Date | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
}

interface Props {
  profile: Profile | null
  email: string
}

export function ProfileSection({ profile, email }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: profile?.first_name ?? '',
      last_name: profile?.last_name ?? '',
      date_of_birth: toDateString(profile?.date_of_birth),
      phone: profile?.phone ?? '',
      address_line1: profile?.address_line1 ?? '',
      address_line2: profile?.address_line2 ?? '',
      city: profile?.city ?? '',
      state: profile?.state ?? '',
      postal_code: profile?.postal_code ?? '',
      country: profile?.country ?? 'US',
    },
  })

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    function onClose() { setOpen(false) }
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [])

  function openModal() {
    reset({
      first_name: profile?.first_name ?? '',
      last_name: profile?.last_name ?? '',
      date_of_birth: toDateString(profile?.date_of_birth),
      phone: profile?.phone ?? '',
      address_line1: profile?.address_line1 ?? '',
      address_line2: profile?.address_line2 ?? '',
      city: profile?.city ?? '',
      state: profile?.state ?? '',
      postal_code: profile?.postal_code ?? '',
      country: profile?.country ?? 'US',
    })
    setServerError(null)
    setOpen(true)
  }

  function closeModal() { setOpen(false) }

  async function onSubmit(values: FormValues) {
    setServerError(null)
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        date_of_birth: values.date_of_birth || null,
        phone: values.phone ? values.phone.replace(/\D/g, '') : null,
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

    closeModal()
    router.refresh()
  }

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '—'
  const addressParts = [
    profile?.address_line1,
    profile?.address_line2,
    [profile?.city, profile?.state].filter(Boolean).join(', '),
    profile?.postal_code,
  ].filter(Boolean)

  return (
    <section className="settings-section">
      <div className="settings-section__header">
        <button
          className="settings-section__toggle"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          <h2>Account Info</h2>
          <ChevronDown size={16} className={`settings-section__caret${expanded ? ' settings-section__caret--open' : ''}`} />
        </button>
        <button className="btn-secondary btn-icon" onClick={openModal} aria-label="Edit account info">
          <Pencil size={14} />
        </button>
      </div>

      {expanded && (
      <dl className="profile-summary profile-summary--indented">
        <div className="profile-summary__row">
          <dt>Name</dt>
          <dd>{fullName}</dd>
        </div>
        <div className="profile-summary__row">
          <dt>Email</dt>
          <dd>{email}</dd>
        </div>
        <div className="profile-summary__row">
          <dt>Phone</dt>
          <dd>{formatPhone(profile?.phone)}</dd>
        </div>
        <div className="profile-summary__row">
          <dt>Date of birth</dt>
          <dd>{toDateString(profile?.date_of_birth) || '—'}</dd>
        </div>
        <div className="profile-summary__row">
          <dt>Address</dt>
          <dd>{addressParts.length > 0 ? addressParts.join(' · ') : '—'}</dd>
        </div>
      </dl>
      )}

      <dialog ref={dialogRef} className="modal" onClick={(e) => { if (e.target === dialogRef.current) closeModal() }}>
        <div className="modal__content">
          <div className="modal__header">
            <h2>Edit account</h2>
            <button className="modal__close" onClick={closeModal} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="profile-form">
            <section className="form-section">
              <h3>Personal</h3>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="m_first_name">First name</label>
                  <input id="m_first_name" type="text" {...register('first_name')} autoComplete="given-name" />
                  {errors.first_name && <span className="field-error">{errors.first_name.message}</span>}
                </div>
                <div className="form-field">
                  <label htmlFor="m_last_name">Last name</label>
                  <input id="m_last_name" type="text" {...register('last_name')} autoComplete="family-name" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="m_dob">Date of birth</label>
                  <input id="m_dob" type="date" {...register('date_of_birth')} />
                  {errors.date_of_birth && <span className="field-error">{errors.date_of_birth.message}</span>}
                </div>
                <div className="form-field">
                  <label htmlFor="m_phone">Phone</label>
                  <input id="m_phone" type="tel" {...register('phone')} autoComplete="tel" />
                </div>
              </div>

              <div className="form-field">
                <label>Email</label>
                <input type="email" value={email} disabled className="input-disabled" />
                <span className="field-hint">Email cannot be changed here.</span>
              </div>
            </section>

            <section className="form-section">
              <h3>Address</h3>
              <div className="form-field">
                <label htmlFor="m_addr1">Address line 1</label>
                <input id="m_addr1" type="text" {...register('address_line1')} autoComplete="address-line1" />
              </div>
              <div className="form-field">
                <label htmlFor="m_addr2">Address line 2</label>
                <input id="m_addr2" type="text" {...register('address_line2')} autoComplete="address-line2" />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="m_city">City</label>
                  <input id="m_city" type="text" {...register('city')} autoComplete="address-level2" />
                </div>
                <div className="form-field">
                  <label htmlFor="m_state">State</label>
                  <input id="m_state" type="text" {...register('state')} autoComplete="address-level1" />
                </div>
                <div className="form-field form-field--narrow">
                  <label htmlFor="m_zip">ZIP</label>
                  <input id="m_zip" type="text" {...register('postal_code')} autoComplete="postal-code" />
                </div>
              </div>
              <div className="form-field form-field--narrow">
                <label htmlFor="m_country">Country</label>
                <input id="m_country" type="text" maxLength={2} {...register('country')} autoComplete="country" />
              </div>
            </section>

            {serverError && <ErrorMessage message={serverError} />}

            <div className="modal__actions">
              <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button type="submit" disabled={isSubmitting || !isDirty} className="btn-primary">
                {isSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </section>
  )
}
