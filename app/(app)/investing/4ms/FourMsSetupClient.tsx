'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ErrorMessage } from '@/components/ErrorMessage'
import { useBusyWhile } from '@/components/BusyOverlay'

const MOAT_TYPES = ['brand', 'switching', 'toll', 'cost', 'secret'] as const
type MoatType = typeof MOAT_TYPES[number]

interface FourMsDraft {
  meaning_notes: string
  moat_types: MoatType[]
  moat_notes: string
  management_notes: string
  mos_notes: string
}

interface Props {
  ticker: string
  companyName: string
}

export function FourMsSetupClient({ ticker, companyName }: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState<FourMsDraft>({
    meaning_notes: '',
    moat_types: [],
    moat_notes: '',
    management_notes: '',
    mos_notes: '',
  })
  const [saving, setSaving] = useState(false)
  useBusyWhile(saving)
  const [error, setError] = useState<string | null>(null)

  function toggleMoat(t: MoatType) {
    setDraft((prev) => ({
      ...prev,
      moat_types: prev.moat_types.includes(t)
        ? prev.moat_types.filter((m) => m !== t)
        : [...prev.moat_types, t],
    }))
  }

  async function saveFourMs(): Promise<boolean> {
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
      return false
    }
    setSaving(false)
    return true
  }

  async function saveAndAddToWatchlist() {
    const ok = await saveFourMs()
    if (ok) router.push(`/investing/watchlist/${ticker}`)
  }

  async function saveAndAddToTooHard() {
    const ok = await saveFourMs()
    if (!ok) return
    const res = await fetch('/api/investing/too-hard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, company_name: companyName, reason: null }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to move to Too Hard pile')
      return
    }
    router.push('/investing')
  }

  return (
    <div className="four-ms-section">
      <div className="form-field">
        <label>Meaning — Do I understand this business?</label>
        <textarea
          rows={3}
          placeholder="Do I use or love the product? Do I understand how they make money?"
          value={draft.meaning_notes}
          onChange={(e) => setDraft({ ...draft, meaning_notes: e.target.value })}
        />
      </div>
      <div className="form-field">
        <label>Moat — Competitive advantage type (select all that apply)</label>
        <div className="moat-type-pills">
          {MOAT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`role-pill${draft.moat_types.includes(t) ? ' role-pill--selected' : ''}`}
              onClick={() => toggleMoat(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="form-field">
        <label>Moat — Notes</label>
        <textarea
          rows={3}
          placeholder="What gives this company its durable competitive advantage?"
          value={draft.moat_notes}
          onChange={(e) => setDraft({ ...draft, moat_notes: e.target.value })}
        />
      </div>
      <div className="form-field">
        <label>Management — CEO &amp; capital allocation notes</label>
        <textarea
          rows={3}
          placeholder="Tenure, ownership stake, capital allocation track record…"
          value={draft.management_notes}
          onChange={(e) => setDraft({ ...draft, management_notes: e.target.value })}
        />
      </div>
      <div className="form-field">
        <label>Margin of Safety — Notes</label>
        <textarea
          rows={3}
          placeholder="Is the current price at or below the Margin of Safety price?"
          value={draft.mos_notes}
          onChange={(e) => setDraft({ ...draft, mos_notes: e.target.value })}
        />
      </div>

      {error && <ErrorMessage message={error} />}

      <div className="form-actions">
        <div className="form-actions__right">
          <button
            className="btn-secondary"
            onClick={saveAndAddToTooHard}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save and Add to Too Hard Pile'}
          </button>
          <button
            className="btn-primary"
            onClick={saveAndAddToWatchlist}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save and Add to Watchlist'}
          </button>
        </div>
      </div>
    </div>
  )
}
