'use client'

import { RefObject, ReactNode } from 'react'
import { X } from 'lucide-react'

interface RecordModalProps {
  dialogRef: RefObject<HTMLDialogElement>
  title: string
  onSave: () => void
  saving: boolean
  /** Save stays disabled until the required fields are filled in. */
  canSave?: boolean
  children: ReactNode
}

/**
 * Shared "add a record" modal used by the ledger-style pages (Budget, Debts,
 * Subscriptions, Auto, Charitable Donations) in place of an inline new row.
 * Closes on Cancel, the ×, a backdrop click, or Escape.
 */
export function RecordModal({ dialogRef, title, onSave, saving, canSave = true, children }: RecordModalProps) {
  const close = () => dialogRef.current?.close()

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClick={(e) => { if (e.target === dialogRef.current) close() }}
    >
      <div className="modal__content">
        <div className="modal__header">
          <h2>{title}</h2>
          <button className="modal__close" onClick={close} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="record-form-grid">{children}</div>
        <div className="modal__actions">
          <button className="btn-secondary" onClick={close}>Cancel</button>
          <button className="btn-primary" onClick={onSave} disabled={saving || !canSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

export function ModalField({ label, full = false, children }: { label: string; full?: boolean; children: ReactNode }) {
  return (
    <label className={`record-field${full ? ' record-field--full' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}
