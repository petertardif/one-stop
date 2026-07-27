'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Pencil, Check, X, Copy, Trash2, ChevronUp, ChevronDown, Search, Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@/components/Spinner'
import { RecordModal, ModalField } from '@/components/RecordModal'
import { MultiSelect } from '@/components/MultiSelect'
import { Tooltip } from '@/components/Tooltip'

type SortKey = 'date' | 'car' | 'description' | 'cost' | 'performed_by'

interface AutoService {
  id: string
  date: string
  car: string
  description: string | null
  cost: string
  performed_by: string | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

interface AutoResponse {
  rows: AutoService[]
}

interface FormState {
  date: string
  car: string
  description: string
  cost: string
  performedBy: string
}

const emptyForm = (): FormState => ({ date: '', car: '', description: '', cost: '', performedBy: '' })
const money = (v: string | null) => (v != null ? `$${parseFloat(v).toFixed(2)}` : '')

export function AutoTable({ role }: { role: string }) {
  const qc = useQueryClient()
  const canWrite = role === 'admin'
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [newRow, setNewRow] = useState<FormState>(emptyForm())
  const newDialogRef = useRef<HTMLDialogElement>(null)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [carFilter, setCarFilter] = useState<string[]>([])
  const [yearFilter, setYearFilter] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)

  const { data, isLoading } = useQuery<AutoResponse>({
    queryKey: ['auto'],
    queryFn: async () => {
      const res = await fetch('/api/auto')
      if (!res.ok) throw new Error('Failed to fetch auto services')
      return res.json()
    },
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setEditingId(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['auto'] })

  const bodyOf = (f: FormState) => ({
    date: f.date,
    car: f.car,
    description: f.description || null,
    cost: f.cost.trim() === '' ? 0 : parseFloat(f.cost),
    performed_by: f.performedBy || null,
  })

  const createMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const res = await fetch('/api/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyOf(f)),
      })
      if (!res.ok) throw new Error('Failed to create service')
    },
    onSuccess: () => { invalidate(); newDialogRef.current?.close(); setNewRow(emptyForm()) },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: FormState }) => {
      const res = await fetch(`/api/auto/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyOf(f)),
      })
      if (!res.ok) throw new Error('Failed to update service')
    },
    onSuccess: () => { invalidate(); setEditingId(null) },
  })

  const duplicateMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/auto/bulk-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Failed to duplicate services')
    },
    onSuccess: () => { invalidate(); setSelectedIds(new Set()) },
  })

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) => fetch(`/api/auto/${id}`, { method: 'DELETE' }).then((r) => {
          if (!r.ok) throw new Error('Failed to delete service')
        }))
      )
    },
    onSuccess: () => { invalidate(); setSelectedIds(new Set()) },
  })

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await fetch('/api/auto/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: orderedIds }),
      })
      if (!res.ok) throw new Error('Failed to reorder services')
    },
    onMutate: async (orderedIds: string[]) => {
      await qc.cancelQueries({ queryKey: ['auto'] })
      const prev = qc.getQueryData<AutoResponse>(['auto'])
      if (prev) {
        const byId = new Map(prev.rows.map((r) => [r.id, r]))
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((r): r is AutoService => Boolean(r))
        qc.setQueryData<AutoResponse>(['auto'], { ...prev, rows: reordered })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['auto'], ctx.prev)
    },
    onSettled: () => invalidate(),
  })

  const rows = data?.rows ?? []

  // Filter option lists derive from the full row set.
  const carOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.car).filter(Boolean))).sort(),
    [rows]
  )
  const yearOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.date.slice(0, 4)))).sort().reverse(),
    [rows]
  )

  // Search + car/year filters + optional column sort. Manual (drag) order is
  // kept when no column sort is active.
  const displayedRows = useMemo(() => {
    let list = rows
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (r) =>
          r.car.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q) ||
          (r.performed_by ?? '').toLowerCase().includes(q)
      )
    }
    if (carFilter.length > 0) list = list.filter((r) => carFilter.includes(r.car))
    if (yearFilter.length > 0) list = list.filter((r) => yearFilter.includes(r.date.slice(0, 4)))
    if (sortKey) {
      const val = (r: AutoService): string | number => {
        switch (sortKey) {
          case 'date': return r.date
          case 'car': return r.car.toLowerCase()
          case 'description': return (r.description ?? '').toLowerCase()
          case 'cost': return parseFloat(r.cost)
          case 'performed_by': return (r.performed_by ?? '').toLowerCase()
        }
      }
      list = [...list].sort((a, b) => {
        const av = val(a), bv = val(b)
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return list
  }, [rows, search, carFilter, yearFilter, sortKey, sortDir])

  const reorderable =
    canWrite && !sortKey && !search.trim() && carFilter.length === 0 && yearFilter.length === 0

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortKey(null); setSortDir('asc') }
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const ordered = [...rows]
    const from = ordered.findIndex((r) => r.id === dragId)
    const to = ordered.findIndex((r) => r.id === targetId)
    setDragId(null)
    if (from === -1 || to === -1) return
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved)
    reorderMutation.mutate(ordered.map((r) => r.id))
  }

  const totalCost = displayedRows.reduce((s, r) => s + parseFloat(r.cost), 0)

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allSelected = displayedRows.length > 0 && displayedRows.every((r) => selectedIds.has(r.id))

  const sortIndicator = (k: SortKey) =>
    sortKey === k ? (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : null
  const sortableTh = (k: SortKey, content: React.ReactNode, className?: string) => (
    <th
      className={['sortable', className].filter(Boolean).join(' ')}
      onClick={() => toggleSort(k)}
      aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="th-sort">{content}{sortIndicator(k)}</span>
    </th>
  )

  const startEdit = (s: AutoService) => {
    setEditingId(s.id)
    setForm({
      date: s.date.slice(0, 10),
      car: s.car,
      description: s.description ?? '',
      cost: parseFloat(s.cost).toString(),
      performedBy: s.performed_by ?? '',
    })
  }

  // Date / Car / Description / Cost / Performed-by cells, shared by new + editing rows.
  const openNewModal = () => {
    setNewRow(emptyForm())
    newDialogRef.current?.showModal()
  }

  const formCells = (state: FormState, set: (f: FormState) => void) => (
    <>
      <td>
        <input type="date" value={state.date} onChange={(e) => set({ ...state, date: e.target.value })} />
      </td>
      <td>
        <input value={state.car} onChange={(e) => set({ ...state, car: e.target.value })} placeholder="Car" />
      </td>
      <td>
        <input value={state.description} onChange={(e) => set({ ...state, description: e.target.value })} placeholder="Service description" />
      </td>
      <td className="amount-col col-center">
        <input type="number" step="0.01" min="0" value={state.cost} onChange={(e) => set({ ...state, cost: e.target.value })} placeholder="Cost" />
      </td>
      <td>
        <input value={state.performedBy} onChange={(e) => set({ ...state, performedBy: e.target.value })} placeholder="Performed by" />
      </td>
    </>
  )

  return (
    <div className="monthly-ledger">
      <div className="ledger-header">
        <h1>Auto</h1>

        <div className="ledger-controls">
          <MultiSelect label="Cars" options={carOptions} selected={carFilter} onChange={setCarFilter} />
          <MultiSelect label="Years" options={yearOptions} selected={yearFilter} onChange={setYearFilter} />

          <div className="ledger-search">
            <Search size={14} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services…"
              aria-label="Search services"
            />
          </div>

          {canWrite && (
            <div className="ledger-actions">
              <button className="primary" onClick={openNewModal}><Plus size={14} /> Add</button>
              <button onClick={() => duplicateMutation.mutate(Array.from(selectedIds))} disabled={selectedIds.size === 0 || duplicateMutation.isPending}><Copy size={14} /> Duplicate</button>
              <button onClick={() => deleteMutation.mutate(Array.from(selectedIds))} disabled={selectedIds.size === 0 || deleteMutation.isPending}><Trash2 size={14} /> Delete</button>
            </div>
          )}
        </div>
      </div>

      {isLoading && <Spinner />}

      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th className="col-center">
                {canWrite && (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => setSelectedIds(e.target.checked ? new Set(displayedRows.map((r) => r.id)) : new Set())}
                    aria-label="Select all"
                  />
                )}
              </th>
              {sortableTh('date', 'Date')}
              {sortableTh('car', 'Car')}
              {sortableTh('description', 'Service Description')}
              {sortableTh('cost', 'Cost', 'amount-col col-center')}
              {sortableTh('performed_by', 'Service Performed by')}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((s) => {
              if (editingId === s.id) {
                return (
                  <tr key={s.id} className="editing-row">
                    <td></td>
                    {formCells(form, setForm)}
                    <td>
                      <button className="icon-btn icon-btn--save" onClick={() => updateMutation.mutate({ id: s.id, f: form })} aria-label="Save"><Check size={16} /></button>
                      <button className="icon-btn icon-btn--cancel" onClick={() => setEditingId(null)} aria-label="Cancel"><X size={16} /></button>
                    </td>
                  </tr>
                )
              }
              return (
                <tr
                  key={s.id}
                  className={[reorderable ? 'draggable-row' : '', dragId === s.id ? 'dragging' : ''].filter(Boolean).join(' ') || undefined}
                  draggable={reorderable}
                  onDragStart={reorderable ? () => setDragId(s.id) : undefined}
                  onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
                  onDrop={reorderable ? () => handleDrop(s.id) : undefined}
                  onDragEnd={reorderable ? () => setDragId(null) : undefined}
                >
                  <td className="col-center">
                    {canWrite && <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} />}
                  </td>
                  <td>{s.date.slice(0, 10)}</td>
                  <td>{s.car}</td>
                  <td>{s.description ?? ''}</td>
                  <td className="amount-col col-center">{money(s.cost)}</td>
                  <td>{s.performed_by ?? ''}</td>
                  <td>
                    {canWrite && (
                      <>
                        <button className="icon-btn icon-btn--edit" onClick={() => startEdit(s)} aria-label="Edit"><Pencil size={16} /></button>
                        <Tooltip text="Duplicate"><button className="icon-btn icon-btn--edit" onClick={() => duplicateMutation.mutate([s.id])} aria-label="Duplicate"><Copy size={16} /></button></Tooltip>
                        <Tooltip text="Delete"><button className="icon-btn icon-btn--delete" onClick={() => deleteMutation.mutate([s.id])} aria-label="Delete"><Trash2 size={16} /></button></Tooltip>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}

            {!isLoading && displayedRows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                  {rows.length === 0 ? 'No service records.' : 'No services match your filters.'}
                </td>
              </tr>
            )}
          </tbody>
          {displayedRows.length > 0 && (
            <tfoot>
              <tr className="budget-total-row">
                <td></td>
                <td>Total</td>
                <td></td>
                <td></td>
                <td className="amount-col col-center">${totalCost.toFixed(2)}</td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <RecordModal
        dialogRef={newDialogRef}
        title="New service record"
        onSave={() => createMutation.mutate(newRow)}
        saving={createMutation.isPending}
        canSave={newRow.car.trim() !== '' && newRow.date !== ''}
      >
        <ModalField label="Date">
          <input type="date" value={newRow.date} onChange={(e) => setNewRow({ ...newRow, date: e.target.value })} />
        </ModalField>
        <ModalField label="Car">
          <input value={newRow.car} autoFocus placeholder="Car"
            onChange={(e) => setNewRow({ ...newRow, car: e.target.value })} />
        </ModalField>
        <ModalField label="Service description" full>
          <input value={newRow.description} placeholder="Service description"
            onChange={(e) => setNewRow({ ...newRow, description: e.target.value })} />
        </ModalField>
        <ModalField label="Cost">
          <input type="number" step="0.01" min="0" value={newRow.cost} placeholder="0.00"
            onChange={(e) => setNewRow({ ...newRow, cost: e.target.value })} />
        </ModalField>
        <ModalField label="Service performed by">
          <input value={newRow.performedBy} placeholder="Performed by"
            onChange={(e) => setNewRow({ ...newRow, performedBy: e.target.value })} />
        </ModalField>
      </RecordModal>
    </div>
  )
}
