'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ErrorMessage } from '@/components/ErrorMessage'

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
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
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
    setDraft('')
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this note?')) return
    await fetch(`/api/investing/watchlist/${ticker}/notes/${id}`, { method: 'DELETE' })
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="notes-section">
      {isAdmin && (
        <div className="notes-add-form">
          <textarea
            rows={3}
            placeholder="Add a research note…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          {error && <ErrorMessage message={error} />}
          <div className="form-actions__right">
            <button className="btn-primary btn-sm" onClick={handleAdd} disabled={saving || !draft.trim()}>
              {saving ? 'Saving…' : 'Add Note'}
            </button>
          </div>
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
    </div>
  )
}
