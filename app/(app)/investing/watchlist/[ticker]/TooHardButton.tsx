'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { ErrorMessage } from '@/components/ErrorMessage'

interface Props {
  ticker: string
  companyName: string
}

export function TooHardButton({ ticker, companyName }: Props) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    setReason('')
    setError(null)
    dialogRef.current?.showModal()
  }

  function closeModal() {
    dialogRef.current?.close()
  }

  async function handleConfirm() {
    setMoving(true)
    setError(null)
    const res = await fetch('/api/investing/too-hard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, company_name: companyName, reason: reason.trim() || null }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed')
      setMoving(false)
      return
    }
    router.push('/investing')
  }

  return (
    <>
      <button className="btn-secondary btn-sm" onClick={openModal}>
        Move to Too Hard Pile
      </button>

      <dialog
        ref={dialogRef}
        className="modal"
        onClick={(e) => { if (e.target === dialogRef.current) closeModal() }}
      >
        <div className="modal__content">
          <div className="modal__header">
            <h2>Move to Too Hard Pile</h2>
            <button className="modal__close" onClick={closeModal} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="form-field">
            <label>Reason <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              rows={3}
              placeholder="Why are you passing on this stock?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
          {error && <ErrorMessage message={error} />}
          <div className="modal__actions">
            <button className="btn-secondary" onClick={closeModal}>Cancel</button>
            <button className="btn-danger" onClick={handleConfirm} disabled={moving}>
              {moving ? 'Moving…' : 'Confirm'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
