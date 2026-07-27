'use client'

import { useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { ErrorMessage } from '@/components/ErrorMessage'
import { useBusyWhile } from '@/components/BusyOverlay'

interface Note {
  id: string
  content: string
  created_at: string
}

interface Props {
  ticker: string
  initialNotes: Note[]
  isAdmin: boolean
}

export function ResearchNotesPanel({ ticker, initialNotes, isAdmin }: Props) {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  useBusyWhile(saving)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  function openModal() {
    setDraft('')
    setError(null)
    dialogRef.current?.showModal()
  }

  function closeModal() {
    dialogRef.current?.close()
  }

  async function handleSave() {
    if (!draft.trim()) return
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/investing/watchlist/${ticker}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: draft.trim() }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to save note')
      setSaving(false)
      return
    }
    const { note } = await res.json()
    setNotes((prev) => [note, ...prev])
    setSaving(false)
    closeModal()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this note?')) return
    await fetch(`/api/investing/watchlist/${ticker}/notes/${id}`, { method: 'DELETE' })
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="notes-section">
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--spacing-md)' }}>
          <button className="btn-primary btn-sm" onClick={openModal}>+ Add Note</button>
        </div>
      )}

      {notes.length === 0 ? (
        <p className="dashboard__empty">No research notes yet.</p>
      ) : (
        <ul className="notes-list">
          {notes.map((note) => (
            <li key={note.id} className="note-card">
              <p className="note-card__content">{note.content}</p>
              <div className="note-card__footer">
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                  {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {isAdmin && (
                  <button className="btn-icon btn-icon--danger note-card__delete" onClick={() => handleDelete(note.id)}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        className="modal"
        onClick={(e) => { if (e.target === dialogRef.current) closeModal() }}
      >
        <div className="modal__content">
          <div className="modal__header">
            <h2>Add Note</h2>
            <button className="modal__close" onClick={closeModal} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="form-field">
            <textarea
              rows={5}
              placeholder="Write your research note…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          </div>
          {error && <ErrorMessage message={error} />}
          <div className="modal__actions">
            <button className="btn-secondary" onClick={closeModal}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !draft.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
