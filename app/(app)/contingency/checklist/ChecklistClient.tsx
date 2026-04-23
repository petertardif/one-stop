'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, ChevronDown } from 'lucide-react'
import type { ChecklistItem } from './page'

const CATEGORY_LABELS: Record<string, string> = {
  immediately: 'Immediately (first 48 hours)',
  first_week: 'First Week',
  first_month: 'First Month',
  ongoing: 'Ongoing',
}

const CATEGORY_ORDER = ['immediately', 'first_week', 'first_month', 'ongoing']

interface Props {
  initialItems: ChecklistItem[]
  isAdmin: boolean
}

interface EditingItem {
  id: string
  title: string
  description: string
}

interface AddingItem {
  category: string
  title: string
  description: string
}

export function ChecklistClient({ initialItems, isAdmin }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<ChecklistItem[]>(initialItems)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<EditingItem | null>(null)
  const [adding, setAdding] = useState<AddingItem | null>(null)
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const notesRefs = useRef<Record<string, string>>({})

  async function toggleComplete(item: ChecklistItem) {
    const newCompleted = !item.completed
    setItems((prev) =>
      prev.map((i) => i.id === item.id ? { ...i, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null } : i)
    )
    await fetch(`/api/contingency/checklist/${item.id}/progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: newCompleted, notes: item.notes }),
    })
  }

  async function saveNotes(item: ChecklistItem, notes: string) {
    await fetch(`/api/contingency/checklist/${item.id}/progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: item.completed ?? false, notes }),
    })
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, notes } : i))
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    await fetch(`/api/contingency/checklist/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editing.title, description: editing.description || null }),
    })
    setItems((prev) =>
      prev.map((i) => i.id === editing.id ? { ...i, title: editing.title, description: editing.description || null } : i)
    )
    setEditing(null)
    setSaving(false)
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this checklist item?')) return
    await fetch(`/api/contingency/checklist/${id}`, { method: 'DELETE' })
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  async function saveAdd() {
    if (!adding || !adding.title.trim()) return
    setSaving(true)
    const res = await fetch('/api/contingency/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: adding.category,
        title: adding.title,
        description: adding.description || null,
      }),
    })
    const data = await res.json()
    setItems((prev) => [...prev, {
      id: data.id,
      category: adding.category as ChecklistItem['category'],
      sort_order: 999,
      title: adding.title,
      description: adding.description || null,
      completed: null,
      notes: null,
      completed_at: null,
    }])
    setAdding(null)
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="page-container page-container--wide">
      <h1 className="page-title">Checklist</h1>

      {CATEGORY_ORDER.map((cat) => {
        const catItems = items.filter((i) => i.category === cat)
        const isCollapsed = collapsed[cat]
        const completedCount = catItems.filter((i) => i.completed).length

        return (
          <div key={cat} className="checklist-group">
            <button
              className="checklist-group__header"
              onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))}
            >
              <span className="checklist-group__title">{CATEGORY_LABELS[cat]}</span>
              <span className="checklist-group__meta">
                {catItems.length > 0 && `${completedCount}/${catItems.length}`}
              </span>
              <ChevronDown size={16} className={`checklist-group__caret${isCollapsed ? '' : ' checklist-group__caret--open'}`} />
            </button>

            {!isCollapsed && (
              <div className="checklist-group__body">
                {catItems.length === 0 && !adding && (
                  <p className="checklist-empty">No items yet.</p>
                )}

                {catItems.map((item) => (
                  <div key={item.id} className={`checklist-item${item.completed ? ' checklist-item--completed' : ''}`}>
                    {editing?.id === item.id ? (
                      <div className="checklist-item__edit">
                        <input
                          className="checklist-edit-input"
                          value={editing.title}
                          onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                          placeholder="Title"
                          autoFocus
                        />
                        <input
                          className="checklist-edit-input checklist-edit-input--desc"
                          value={editing.description}
                          onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                          placeholder="Description (optional)"
                        />
                        <div className="checklist-item__edit-actions">
                          <button className="btn-primary btn-sm" onClick={saveEdit} disabled={saving}>Save</button>
                          <button className="btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <input
                          type="checkbox"
                          className="checklist-item__check"
                          checked={item.completed ?? false}
                          onChange={() => toggleComplete(item)}
                        />
                        <div className="checklist-item__content">
                          <span className="checklist-item__title">{item.title}</span>
                          {item.description && (
                            <span className="checklist-item__desc">{item.description}</span>
                          )}
                          {expandedNotes[item.id] && (
                            <textarea
                              className="checklist-item__notes"
                              defaultValue={item.notes ?? ''}
                              placeholder="Add notes…"
                              rows={2}
                              onBlur={(e) => saveNotes(item, e.target.value)}
                              onChange={(e) => { notesRefs.current[item.id] = e.target.value }}
                            />
                          )}
                          <button
                            className="checklist-item__notes-toggle"
                            onClick={() => setExpandedNotes((n) => ({ ...n, [item.id]: !n[item.id] }))}
                          >
                            {expandedNotes[item.id] ? 'Hide notes' : item.notes ? 'View notes' : 'Add notes'}
                          </button>
                        </div>
                        {isAdmin && (
                          <div className="checklist-item__actions">
                            <button
                              className="btn-icon"
                              onClick={() => setEditing({ id: item.id, title: item.title, description: item.description ?? '' })}
                              title="Edit"
                            >
                              <Pencil size={13} />
                            </button>
                            <button className="btn-icon btn-icon--danger" onClick={() => deleteItem(item.id)} title="Delete">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}

                {adding?.category === cat ? (
                  <div className="checklist-item__edit checklist-item__edit--add">
                    <input
                      className="checklist-edit-input"
                      value={adding.title}
                      onChange={(e) => setAdding({ ...adding, title: e.target.value })}
                      placeholder="Item title"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') setAdding(null) }}
                    />
                    <input
                      className="checklist-edit-input checklist-edit-input--desc"
                      value={adding.description}
                      onChange={(e) => setAdding({ ...adding, description: e.target.value })}
                      placeholder="Description (optional)"
                    />
                    <div className="checklist-item__edit-actions">
                      <button className="btn-primary btn-sm" onClick={saveAdd} disabled={saving || !adding.title.trim()}>Add</button>
                      <button className="btn-secondary btn-sm" onClick={() => setAdding(null)}>Cancel</button>
                    </div>
                  </div>
                ) : isAdmin && (
                  <button
                    className="checklist-add-btn"
                    onClick={() => setAdding({ category: cat, title: '', description: '' })}
                  >
                    <Plus size={14} /> Add item
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
