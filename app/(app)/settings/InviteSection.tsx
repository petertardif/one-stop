'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Send, X, ChevronDown, AlertTriangle } from 'lucide-react'
import { ErrorMessage } from '@/components/ErrorMessage'

type Role = 'partner_admin' | 'partner' | 'dependent'

const ROLES: { value: Role; label: string; tooltip: string }[] = [
  {
    value: 'partner_admin',
    label: 'Partner Admin',
    tooltip: 'Full access — same permissions as admin. Best for a co-managing spouse or trusted partner.',
  },
  {
    value: 'partner',
    label: 'Partner',
    tooltip: 'Read-only access to Dashboard, Monthly Budget, and In Case I Die. Can view investing research.',
  },
  {
    value: 'dependent',
    label: 'Dependent',
    tooltip: 'View-only access to Dashboard and In Case I Die. No access to financial editing.',
  },
]

export interface Invite {
  id: string
  email_hint: string | null
  role: string
  expires_at: string
  status: 'pending' | 'accepted' | 'expired'
}

interface Props {
  invites: Invite[]
  defaultRole: Role
}

interface RoleConflict {
  existingRole: string
  pendingRole: Role
  email: string
}

export function InviteSection({ invites, defaultRole }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role>(defaultRole)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<{ url: string; email: string; emailSent: boolean } | null>(null)
  const [showLink, setShowLink] = useState(false)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [conflict, setConflict] = useState<RoleConflict | null>(null)
  const [duplicateEmail, setDuplicateEmail] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    function onClose() { setOpen(false) }
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [])

  function openModal() {
    setSelectedRole(defaultRole)
    setEmail('')
    setEmailError(null)
    setServerError(null)
    setInviteResult(null)
    setShowLink(false)
    setCopied(false)
    setConflict(null)
    setDuplicateEmail(null)
    setOpen(true)
  }

  function closeModal() {
    setConflict(null)
    setOpen(false)
  }

  function validateEmail(value: string): boolean {
    if (!value.trim()) {
      setEmailError('Email address is required')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError('Invalid email address')
      return false
    }
    setEmailError(null)
    return true
  }

  async function submitInvite({ force = false, resend = false } = {}) {
    const emailValid = validateEmail(email)
    if (!emailValid) return
    setSubmitting(true)
    setServerError(null)
    setDuplicateEmail(null)

    const res = await fetch('/api/auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailHint: email || undefined,
        role: selectedRole,
        force,
        resend,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      if (data.error === 'ROLE_CONFLICT') {
        setConflict({ existingRole: data.existingRole, pendingRole: selectedRole, email })
        setSubmitting(false)
        return
      }
      if (data.error === 'DUPLICATE_INVITE') {
        setDuplicateEmail(email)
        setSubmitting(false)
        return
      }
      setServerError(data.error ?? 'Failed to send invite')
      setSubmitting(false)
      return
    }

    setInviteResult({ url: data.inviteUrl, email, emailSent: data.emailSent ?? false })
    setShowLink(false)
    setCopied(false)
    setEmail('')
    setConflict(null)
    router.refresh()
    setSubmitting(false)
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

  const roleLabel = (role: string) =>
    ROLES.find((r) => r.value === role)?.label ?? role

  return (
    <section className="settings-section">
      <div className="settings-section__header">
        <button
          className="settings-section__toggle"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          <h2>Invite Family Member</h2>
          <ChevronDown
            size={16}
            className={`settings-section__caret${expanded ? ' settings-section__caret--open' : ''}`}
          />
        </button>
        <button className="btn-secondary btn-icon" onClick={openModal} aria-label="Invite family member">
          <Send size={14} />
        </button>
      </div>

      {expanded && invites.length > 0 && (
        <div className="pending-invites profile-summary--indented">
          <table className="invites-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id}>
                  <td>{invite.email_hint ?? '—'}</td>
                  <td>{roleLabel(invite.role)}</td>
                  <td>
                    <span className={`invite-status invite-status--${invite.status}`}>
                      {invite.status}
                    </span>
                  </td>
                  <td>{new Date(invite.expires_at).toLocaleDateString()}</td>
                  <td>
                    {invite.status === 'pending' && (
                      <button onClick={() => revokeInvite(invite.id)} className="btn-danger-small">
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expanded && invites.length === 0 && (
        <p className="settings-description profile-summary--indented">No invites sent yet.</p>
      )}

      <dialog
        ref={dialogRef}
        className="modal"
        onClick={(e) => { if (e.target === dialogRef.current) closeModal() }}
      >
        <div className="modal__content">
          <div className="modal__header">
            <h2>Invite Family Member</h2>
            <button className="modal__close" onClick={closeModal} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <p className="settings-description">
            Generate a single-use invite link. Links expire after 72 hours.
          </p>

          {/* Role pills */}
          <div className="form-field">
            <label>Role <span className="field-required">*</span></label>
            <div className="role-pills">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  title={r.tooltip}
                  className={`role-pill${selectedRole === r.value ? ' role-pill--selected' : ''}`}
                  onClick={() => { setSelectedRole(r.value); setConflict(null) }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Email */}
          <div className="form-field">
            <label htmlFor="inv_email">Email address <span className="field-required">*</span></label>
            <input
              id="inv_email"
              type="email"
              placeholder="family@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); setConflict(null); setDuplicateEmail(null) }}
              onBlur={(e) => validateEmail(e.target.value)}
              aria-required="true"
            />
            {emailError && <span className="field-error">{emailError}</span>}
          </div>

          {/* Conflict confirmation */}
          {conflict && (
            <div className="invite-conflict">
              <AlertTriangle size={16} />
              <div>
                <p>
                  <strong>{conflict.email}</strong> already has an active invite as{' '}
                  <strong>{roleLabel(conflict.existingRole)}</strong>. Confirming will update
                  the existing link&apos;s role to{' '}
                  <strong>{roleLabel(conflict.pendingRole)}</strong>. The link stays active.
                </p>
                <div className="invite-conflict__actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setConflict(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={submitting}
                    onClick={() => submitInvite({ force: true })}
                  >
                    {submitting ? 'Updating…' : 'Confirm Change'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {serverError && <ErrorMessage message={serverError} />}

          {inviteResult && (
            <div className={`invite-success${!inviteResult.emailSent ? ' invite-success--warn' : ''}`}>
              {inviteResult.emailSent ? (
                <p>
                  Invite sent to <strong>{inviteResult.email}</strong>.{' '}
                  <button
                    type="button"
                    className="invite-show-link"
                    onClick={() => setShowLink((s) => !s)}
                  >
                    {showLink ? 'Hide link' : 'Show link'}
                  </button>
                </p>
              ) : (
                <p>
                  Email could not be sent. Share this link privately with <strong>{inviteResult.email}</strong>:
                </p>
              )}
              {(showLink || !inviteResult.emailSent) && (
                <div className="invite-url-row">
                  <code className="invite-url">{inviteResult.url}</code>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => copyToClipboard(inviteResult.url)}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          )}

          {duplicateEmail && (
            <div className="invite-duplicate">
              <p>An active invite already exists for <strong>{duplicateEmail}</strong>. Would you like to resend it?</p>
              <div className="modal__actions">
                <button type="button" className="btn-secondary" onClick={() => setDuplicateEmail(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={submitting}
                  onClick={() => submitInvite({ resend: true })}
                >
                  {submitting ? 'Sending…' : 'Resend Invite'}
                </button>
              </div>
            </div>
          )}

          {!conflict && !duplicateEmail && (
            <div className="modal__actions">
              <button type="button" className="btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={submitting || !!emailError || !email.trim()}
                onClick={() => submitInvite()}
              >
                {submitting ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          )}
        </div>
      </dialog>
    </section>
  )
}
