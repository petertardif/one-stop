'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X } from 'lucide-react'
import { ErrorMessage } from '@/components/ErrorMessage'

interface Props {
  ticker: string
  initialName: string
  initialSector: string
}

export function EditStockInfoButton({ ticker, initialName, initialSector }: Props) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(initialName)
  const [sector, setSector] = useState(initialSector)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    setName(initialName)
    setSector(initialSector)
    setError(null)
    dialogRef.current?.showModal()
  }

  function closeModal() {
    dialogRef.current?.close()
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/investing/watchlist/${ticker}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: name.trim(), sector: sector.trim() || null }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to save')
      setSaving(false)
      return
    }
    closeModal()
    router.refresh()
  }

  return (
    <>
      <button className="btn-icon" onClick={openModal} title="Edit name and sector" aria-label="Edit stock info">
        <Pencil size={14} />
      </button>

      <dialog
        ref={dialogRef}
        className="modal"
        onClick={(e) => { if (e.target === dialogRef.current) closeModal() }}
      >
        <div className="modal__content">
          <div className="modal__header">
            <h2>Edit Stock Info</h2>
            <button className="modal__close" onClick={closeModal} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="form-field">
            <label>Company Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-field">
            <label>Sector <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input
              type="text"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="e.g. Technology"
            />
          </div>
          {error && <ErrorMessage message={error} />}
          <div className="modal__actions">
            <button className="btn-secondary" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
