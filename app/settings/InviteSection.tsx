'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'

const schema = z.object({
  emailHint: z.union([z.string().email('Invalid email address'), z.literal('')]).optional(),
})

type FormValues = z.infer<typeof schema>

interface PendingInvite {
  id: string
  email_hint: string | null
  expires_at: string
  created_at: string
}

export function InviteSection({ pendingInvites }: { pendingInvites: PendingInvite[] }) {
  const router = useRouter()
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    setGeneratedUrl(null)

    const res = await fetch('/api/auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailHint: values.emailHint || undefined }),
    })

    if (!res.ok) {
      const data = await res.json()
      setServerError(data.error ?? 'Failed to generate invite')
      return
    }

    const data = await res.json()
    setGeneratedUrl(data.inviteUrl)
    reset()
    router.refresh()
  }

  async function copyToClipboard(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function revokeInvite(id: string) {
    await fetch('/api/auth/invite/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    router.refresh()
  }

  return (
    <section className="settings-section">
      <h2>Invite Spouse</h2>
      <p className="settings-description">
        Generate a single-use invite link. Links expire after 72 hours.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="invite-form">
        <div className="form-field">
          <label htmlFor="emailHint">Email address (optional)</label>
          <input
            id="emailHint"
            type="email"
            placeholder="spouse@example.com"
            {...register('emailHint')}
          />
          {errors.emailHint && (
            <span className="field-error">{errors.emailHint.message}</span>
          )}
        </div>

        {serverError && <p className="auth-error">{serverError}</p>}

        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Generating…' : 'Generate invite link'}
        </button>
      </form>

      {generatedUrl && (
        <div className="invite-url-box">
          <p className="invite-url-label">Invite link (copy and send privately):</p>
          <div className="invite-url-row">
            <code className="invite-url">{generatedUrl}</code>
            <button onClick={() => copyToClipboard(generatedUrl)} className="btn-secondary">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div className="pending-invites">
          <h3>Pending invites</h3>
          <table className="invites-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingInvites.map((invite) => (
                <tr key={invite.id}>
                  <td>{invite.email_hint ?? '—'}</td>
                  <td>{new Date(invite.expires_at).toLocaleString()}</td>
                  <td>
                    <button
                      onClick={() => revokeInvite(invite.id)}
                      className="btn-danger-small"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
