'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { ErrorMessage } from '@/components/ErrorMessage'

const MOAT_TYPES = ['brand', 'switching', 'toll', 'cost', 'secret'] as const
type MoatType = typeof MOAT_TYPES[number]

interface FourMs {
  meaning_notes: string | null
  moat_type: MoatType | null
  moat_notes: string | null
  management_notes: string | null
  mos_notes: string | null
}

interface Props {
  ticker: string
  initial: FourMs | null
  isAdmin: boolean
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="four-ms-item">
      <span className="four-ms-item__label">{label}</span>
      {value ? (
        <p className="four-ms-item__content">{value}</p>
      ) : (
        <p className="four-ms-item__empty">Not filled in yet.</p>
      )}
    </div>
  )
}

export function FourMsPanel({ ticker, initial, isAdmin }: Props) {
  const [data, setData] = useState<FourMs>(initial ?? {
    meaning_notes: null, moat_type: null, moat_notes: null,
    management_notes: null, mos_notes: null,
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<FourMs>(data)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/investing/watchlist/${ticker}/four-ms`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Save failed')
      setSaving(false)
      return
    }
    setData(draft)
    setEditing(false)
    setSaving(false)
  }

  if (editing) {
    return (
      <div className="four-ms-section">
        <div className="form-field">
          <label>Meaning — Do I understand this business?</label>
          <textarea rows={3} value={draft.meaning_notes ?? ''} onChange={(e) => setDraft({ ...draft, meaning_notes: e.target.value })} />
        </div>
        <div className="form-field">
          <label>Moat — Competitive advantage type</label>
          <div className="moat-type-pills">
            {MOAT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`role-pill${draft.moat_type === t ? ' role-pill--selected' : ''}`}
                onClick={() => setDraft({ ...draft, moat_type: draft.moat_type === t ? null : t })}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="form-field">
          <label>Moat — Notes</label>
          <textarea rows={3} value={draft.moat_notes ?? ''} onChange={(e) => setDraft({ ...draft, moat_notes: e.target.value })} />
        </div>
        <div className="form-field">
          <label>Management — CEO &amp; capital allocation notes</label>
          <textarea rows={3} value={draft.management_notes ?? ''} onChange={(e) => setDraft({ ...draft, management_notes: e.target.value })} />
        </div>
        <div className="form-field">
          <label>Margin of Safety — Notes</label>
          <textarea rows={3} value={draft.mos_notes ?? ''} onChange={(e) => setDraft({ ...draft, mos_notes: e.target.value })} />
        </div>
        {error && <ErrorMessage message={error} />}
        <div className="form-actions">
          <div className="form-actions__right">
            <button className="btn-secondary" onClick={() => { setDraft(data); setEditing(false) }}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="four-ms-section">
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-sm btn-secondary" onClick={() => { setDraft(data); setEditing(true) }}>
            <Pencil size={13} /> Edit 4Ms
          </button>
        </div>
      )}
      <Field label="Meaning" value={data.meaning_notes} />
      <div className="four-ms-item">
        <span className="four-ms-item__label">Moat</span>
        {data.moat_type && <span className="role-pill role-pill--selected" style={{ alignSelf: 'flex-start' }}>{data.moat_type}</span>}
        {data.moat_notes ? <p className="four-ms-item__content">{data.moat_notes}</p> : <p className="four-ms-item__empty">Not filled in yet.</p>}
      </div>
      <Field label="Management" value={data.management_notes} />
      <Field label="Margin of Safety" value={data.mos_notes} />
    </div>
  )
}
