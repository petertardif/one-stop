'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, ShieldAlert } from 'lucide-react'
import { ErrorMessage } from '@/components/ErrorMessage'

export interface VaultEntry {
  id: string
  category: string
  title: string
  fields: Record<string, string | null>
  last_verified_at: string | null
}

export interface FieldDef {
  key: string
  label: string
}

interface Props {
  initialEntries: VaultEntry[]
  categoryLabel: string
  categorySlug: string
  fieldDefs: FieldDef[]
  isAdmin: boolean
}

function fmtDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function EntryForm({
  entry,
  fieldDefs,
  onSave,
  onCancel,
}: {
  entry: Partial<VaultEntry>
  fieldDefs: FieldDef[]
  onSave: (title: string, fields: Record<string, string>) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(entry.title ?? '')
  const [fields, setFields] = useState<Record<string, string>>(
    Object.fromEntries(fieldDefs.map((f) => [f.key, entry.fields?.[f.key] ?? '']))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    try { await onSave(title, fields) } catch { setError('Something went wrong') }
    setSaving(false)
  }

  return (
    <div className="vault-form">
      <div className="form-field">
        <label>Title <span className="field-required">*</span></label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chase Checking" autoFocus />
      </div>
      {fieldDefs.map((f) => (
        <div key={f.key} className="form-field">
          <label>{f.label}</label>
          <input
            value={fields[f.key] ?? ''}
            onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      {error && <ErrorMessage message={error} />}
      <div className="form-actions">
        <div className="form-actions__right">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function VaultCategoryClient({ initialEntries, categoryLabel, categorySlug, fieldDefs, isAdmin }: Props) {
  const [entries, setEntries] = useState<VaultEntry[]>(initialEntries)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [verifying, setVerifying] = useState<string | null>(null)

  async function handleAdd(title: string, fields: Record<string, string>) {
    const res = await fetch('/api/contingency/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: categorySlug, title, fields }),
    })
    const data = await res.json()
    setEntries((prev) => [...prev, { id: data.id, category: prev[0]?.category ?? '', title, fields, last_verified_at: null }])
    setAdding(false)
  }

  async function handleEdit(id: string, title: string, fields: Record<string, string>) {
    await fetch(`/api/contingency/vault/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, fields }),
    })
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, title, fields } : e))
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry?')) return
    await fetch(`/api/contingency/vault/${id}`, { method: 'DELETE' })
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  async function handleVerify(id: string) {
    setVerifying(id)
    const now = new Date().toISOString()
    await fetch(`/api/contingency/vault/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_verified_at: now }),
    })
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, last_verified_at: now } : e))
    setVerifying(null)
  }

  return (
    <div className="page-container page-container--wide">
      <div className="vault-category-header">
        <h1 className="page-title">{categoryLabel}</h1>
        {isAdmin && !adding && (
          <button className="btn-sm btn-secondary" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add entry
          </button>
        )}
      </div>

      <div className="vault-password-warning">
        <ShieldAlert size={15} />
        Never store passwords here. Use a password manager (1Password, Bitwarden, etc.) and reference it in the "how to access" field.
      </div>

      {adding && (
        <div className="vault-entry vault-entry--form">
          <EntryForm
            entry={{ category: categorySlug, fields: {} }}
            fieldDefs={fieldDefs}
            onSave={(title, fields) => handleAdd(title, fields)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {entries.length === 0 && !adding && (
        <div className="empty-state">
          <img src="/empty-vault.svg" alt="" width={200} height={200} />
          <p className="empty-state__text">No entries yet.{isAdmin ? ' Click "Add entry" to get started.' : ''}</p>
        </div>
      )}

      {entries.map((entry) => (
        <div key={entry.id} className="vault-entry">
          {editingId === entry.id ? (
            <EntryForm
              entry={entry}
              fieldDefs={fieldDefs}
              onSave={(title, fields) => handleEdit(entry.id, title, fields)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
              <div className="vault-entry__header">
                <h3 className="vault-entry__title">{entry.title}</h3>
                <div className="vault-entry__actions">
                  <span className="vault-entry__verified">
                    {entry.last_verified_at ? `Verified ${fmtDate(entry.last_verified_at)}` : 'Not yet verified'}
                  </span>
                  <button
                    className="btn-sm btn-secondary"
                    onClick={() => handleVerify(entry.id)}
                    disabled={verifying === entry.id}
                  >
                    {verifying === entry.id ? 'Saving…' : 'Mark verified'}
                  </button>
                  {isAdmin && (
                    <>
                      <button className="btn-icon" onClick={() => setEditingId(entry.id)} title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button className="btn-icon btn-icon--danger" onClick={() => handleDelete(entry.id)} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <dl className="vault-entry__fields">
                {fieldDefs.map((f) => {
                  const val = entry.fields?.[f.key]
                  if (!val) return null
                  return (
                    <div key={f.key} className="vault-entry__field">
                      <dt>{f.label}</dt>
                      <dd>{val}</dd>
                    </div>
                  )
                })}
              </dl>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
