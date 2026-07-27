'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Pencil, Check, X, Ban, ArchiveRestore, Trash2, ChevronUp, ChevronDown, Search, Plus, Copy } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@/components/Spinner'
import { RecordModal, ModalField } from '@/components/RecordModal'
import { Tooltip } from '@/components/Tooltip'

type Tab = 'active' | 'cancelled'
type Cycle = 'monthly' | 'annual'
type SortKey = 'category' | 'service' | 'company' | 'price_year' | 'price_month' | 'renewal' | 'cancelled'

interface Subscription {
  id: string
  category: string | null
  service: string | null
  company: string | null
  price_per_year: string | null
  price_per_month: string | null
  renewal_cycle: Cycle
  renewal_day: number | null
  renewal_date: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

interface SubscriptionsResponse {
  rows: Subscription[]
  categories: string[]
}

interface FormState {
  category: string
  service: string
  company: string
  priceYear: string
  priceMonth: string
  renewalCycle: Cycle
  renewalDay: string
  renewalDate: string
}

// Free-form category taxonomy (users may also type new categories).
const SUB_CATEGORIES = [
  'ENTERTAINMENT', 'STORAGE', 'FITNESS', 'FINANCIAL', 'GROCERIES',
  'SUBSCRIPTION', 'TECHNOLOGY', 'OTHER',
]

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}
const emptyForm = (): FormState => ({
  category: '', service: '', company: '', priceYear: '', priceMonth: '',
  renewalCycle: 'monthly', renewalDay: '', renewalDate: '',
})
const money = (v: string | null) => (v != null ? `$${parseFloat(v).toFixed(2)}` : '')
const renewalLabel = (s: Subscription) => {
  if (s.renewal_cycle === 'monthly') return s.renewal_day ? `Monthly - ${ordinal(s.renewal_day)}` : 'Monthly'
  return s.renewal_date ? s.renewal_date.slice(0, 10) : 'Annual'
}
// Build the API payload for the renewal fields based on the chosen cycle.
const renewalPayload = (f: FormState) => ({
  renewal_cycle: f.renewalCycle,
  renewal_day: f.renewalCycle === 'monthly' && f.renewalDay ? parseInt(f.renewalDay, 10) : null,
  renewal_date: f.renewalCycle === 'annual' && f.renewalDate ? f.renewalDate : null,
})
const pricePayload = (v: string) => (v.trim() === '' ? null : parseFloat(v))

export function SubscriptionsTable({ role }: { role: string }) {
  const qc = useQueryClient()
  const canWrite = role === 'admin'
  const [tab, setTab] = useState<Tab>('active')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [newRow, setNewRow] = useState<FormState>(emptyForm())
  const newDialogRef = useRef<HTMLDialogElement>(null)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  const { data, isLoading } = useQuery<SubscriptionsResponse>({
    queryKey: ['subscriptions', tab],
    queryFn: async () => {
      const res = await fetch(`/api/subscriptions?tab=${tab}`)
      if (!res.ok) throw new Error('Failed to fetch subscriptions')
      return res.json()
    },
  })

  useEffect(() => {
    setSelectedIds(new Set())
    setEditingId(null)
    newDialogRef.current?.close()
  }, [tab])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['subscriptions'] })

  const bodyOf = (f: FormState) => ({
    category: f.category || null,
    service: f.service,
    company: f.company || null,
    price_per_year: pricePayload(f.priceYear),
    price_per_month: pricePayload(f.priceMonth),
    ...renewalPayload(f),
  })

  const createMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyOf(f)),
      })
      if (!res.ok) throw new Error('Failed to create subscription')
    },
    onSuccess: () => { invalidate(); newDialogRef.current?.close(); setNewRow(emptyForm()) },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: FormState }) => {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyOf(f)),
      })
      if (!res.ok) throw new Error('Failed to update subscription')
    },
    onSuccess: () => { invalidate(); setEditingId(null) },
  })

  const bulkPost = (path: string) => async (ids: string[]) => {
    const res = await fetch(`/api/subscriptions/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) throw new Error(`Failed: ${path}`)
  }
  const onBulkSuccess = { onSuccess: () => { invalidate(); setSelectedIds(new Set()) } }

  const cancelMutation = useMutation({ mutationFn: bulkPost('mark-cancelled'), ...onBulkSuccess })
  const restoreMutation = useMutation({ mutationFn: bulkPost('restore'), ...onBulkSuccess })
  const duplicateMutation = useMutation({ mutationFn: bulkPost('bulk-duplicate'), ...onBulkSuccess })

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) => fetch(`/api/subscriptions/${id}`, { method: 'DELETE' }).then((r) => {
          if (!r.ok) throw new Error('Failed to delete subscription')
        }))
      )
    },
    onSuccess: () => { invalidate(); setSelectedIds(new Set()) },
  })

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await fetch('/api/subscriptions/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: orderedIds }),
      })
      if (!res.ok) throw new Error('Failed to reorder subscriptions')
    },
    onMutate: async (orderedIds: string[]) => {
      await qc.cancelQueries({ queryKey: ['subscriptions', tab] })
      const prev = qc.getQueryData<SubscriptionsResponse>(['subscriptions', tab])
      if (prev) {
        const byId = new Map(prev.rows.map((r) => [r.id, r]))
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((r): r is Subscription => Boolean(r))
        qc.setQueryData<SubscriptionsResponse>(['subscriptions', tab], { ...prev, rows: reordered })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['subscriptions', tab], ctx.prev)
    },
    onSettled: () => invalidate(),
  })

  const rows = data?.rows ?? []
  const categoryOptions = Array.from(new Set([...SUB_CATEGORIES, ...(data?.categories ?? [])])).sort()
  const isCancelled = tab === 'cancelled'
  const colCount = isCancelled ? 9 : 8

  // Search + category filter + optional column sort. Manual (drag) order is kept
  // when no column sort is active.
  const displayedRows = useMemo(() => {
    let list = rows
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (r) =>
          (r.service ?? '').toLowerCase().includes(q) ||
          (r.company ?? '').toLowerCase().includes(q) ||
          (r.category ?? '').toLowerCase().includes(q)
      )
    }
    if (categoryFilter) list = list.filter((r) => (r.category ?? '') === categoryFilter)
    if (sortKey) {
      const val = (r: Subscription): string | number => {
        switch (sortKey) {
          case 'category': return (r.category ?? '').toLowerCase()
          case 'service': return (r.service ?? '').toLowerCase()
          case 'company': return (r.company ?? '').toLowerCase()
          case 'price_year': return r.price_per_year != null ? parseFloat(r.price_per_year) : -Infinity
          case 'price_month': return r.price_per_month != null ? parseFloat(r.price_per_month) : -Infinity
          case 'renewal': return renewalLabel(r).toLowerCase()
          case 'cancelled': return r.cancelled_at ?? ''
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
  }, [rows, search, categoryFilter, sortKey, sortDir])

  const reorderable = canWrite && !isCancelled && !sortKey && !search.trim() && !categoryFilter

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

  const totalYear = displayedRows.reduce((s, r) => s + (r.price_per_year ? parseFloat(r.price_per_year) : 0), 0)
  const totalMonth = displayedRows.reduce((s, r) => s + (r.price_per_month ? parseFloat(r.price_per_month) : 0), 0)

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

  const startEdit = (s: Subscription) => {
    setEditingId(s.id)
    setForm({
      category: s.category ?? '',
      service: s.service ?? '',
      company: s.company ?? '',
      priceYear: s.price_per_year != null ? parseFloat(s.price_per_year).toString() : '',
      priceMonth: s.price_per_month != null ? parseFloat(s.price_per_month).toString() : '',
      renewalCycle: s.renewal_cycle,
      renewalDay: s.renewal_day != null ? String(s.renewal_day) : '',
      renewalDate: s.renewal_date ? s.renewal_date.slice(0, 10) : '',
    })
  }

  // Category / Service / Company / Yr / Mo / Renewal cells, shared by new + editing rows.
  const openNewModal = () => {
    setNewRow(emptyForm())
    newDialogRef.current?.showModal()
  }

  const formCells = (state: FormState, set: (f: FormState) => void) => (
    <>
      <td>
        <input
          list="subscription-categories-list"
          value={state.category}
          onChange={(e) => set({ ...state, category: e.target.value.toUpperCase() })}
          placeholder="Category"
        />
      </td>
      <td>
        <input value={state.service} onChange={(e) => set({ ...state, service: e.target.value })} placeholder="Service" />
      </td>
      <td>
        <input value={state.company} onChange={(e) => set({ ...state, company: e.target.value })} placeholder="Company" />
      </td>
      <td className="amount-col col-center">
        <input type="number" step="0.01" min="0" value={state.priceYear} onChange={(e) => set({ ...state, priceYear: e.target.value })} placeholder="Year" />
      </td>
      <td className="amount-col col-center">
        <input type="number" step="0.01" min="0" value={state.priceMonth} onChange={(e) => set({ ...state, priceMonth: e.target.value })} placeholder="Month" />
      </td>
      <td>
        <select value={state.renewalCycle} onChange={(e) => set({ ...state, renewalCycle: e.target.value as Cycle })}>
          <option value="monthly">Monthly</option>
          <option value="annual">Annual</option>
        </select>
        {state.renewalCycle === 'monthly' ? (
          <select value={state.renewalDay} onChange={(e) => set({ ...state, renewalDay: e.target.value })}>
            <option value="">—</option>
            {DAYS.map((d) => <option key={d} value={String(d)}>{ordinal(d)}</option>)}
          </select>
        ) : (
          <input type="date" value={state.renewalDate} onChange={(e) => set({ ...state, renewalDate: e.target.value })} />
        )}
      </td>
    </>
  )

  return (
    <div className="monthly-ledger">
      <div className="ledger-header">
        <h1>Subscriptions</h1>

        <div className="ledger-controls">
          <div className="account-tabs">
            <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active</button>
            <button className={tab === 'cancelled' ? 'active' : ''} onClick={() => setTab('cancelled')}>Cancelled</button>
          </div>

          <div className="ledger-search">
            <Search size={14} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subscriptions…"
              aria-label="Search subscriptions"
            />
          </div>

          <select
            className="ledger-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {canWrite && (
            <div className="ledger-actions">
              {!isCancelled ? (
                <>
                  <button className="primary" onClick={openNewModal}><Plus size={14} /> Add</button>
                  <button onClick={() => cancelMutation.mutate(Array.from(selectedIds))} disabled={selectedIds.size === 0 || cancelMutation.isPending}><Ban size={14} /> Mark as Cancelled</button>
                  <button onClick={() => duplicateMutation.mutate(Array.from(selectedIds))} disabled={selectedIds.size === 0 || duplicateMutation.isPending}><Copy size={14} /> Duplicate</button>
                </>
              ) : (
                <>
                  <button onClick={() => restoreMutation.mutate(Array.from(selectedIds))} disabled={selectedIds.size === 0 || restoreMutation.isPending}><ArchiveRestore size={14} /> Restore</button>
                  <button onClick={() => deleteMutation.mutate(Array.from(selectedIds))} disabled={selectedIds.size === 0 || deleteMutation.isPending}><Trash2 size={14} /> Delete</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {isLoading && <Spinner />}

      <datalist id="subscription-categories-list">
        {categoryOptions.map((c) => <option key={c} value={c} />)}
      </datalist>

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
              {sortableTh('category', 'Category')}
              {sortableTh('service', 'Service')}
              {sortableTh('company', 'Company')}
              {sortableTh('price_year', <>Price/Year</>, 'amount-col col-center')}
              {sortableTh('price_month', <>Price/Month</>, 'amount-col col-center')}
              {sortableTh('renewal', 'Renewal')}
              {isCancelled && sortableTh('cancelled', 'Cancelled')}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((s) => {
              if (editingId === s.id && !isCancelled) {
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
                  <td>{s.category ?? ''}</td>
                  <td>{s.service ?? ''}</td>
                  <td>{s.company ?? ''}</td>
                  <td className="amount-col col-center">{money(s.price_per_year)}</td>
                  <td className="amount-col col-center">{money(s.price_per_month)}</td>
                  <td>{renewalLabel(s)}</td>
                  {isCancelled && <td>{s.cancelled_at ? s.cancelled_at.slice(0, 10) : ''}</td>}
                  <td>
                    {canWrite && (!isCancelled ? (
                      <>
                        <button className="icon-btn icon-btn--edit" onClick={() => startEdit(s)} aria-label="Edit"><Pencil size={16} /></button>
                        <Tooltip text="Mark as Cancelled"><button className="icon-btn icon-btn--delete" onClick={() => cancelMutation.mutate([s.id])} aria-label="Mark as Cancelled"><Ban size={16} /></button></Tooltip>
                      </>
                    ) : (
                      <>
                        <Tooltip text="Restore"><button className="icon-btn icon-btn--save" onClick={() => restoreMutation.mutate([s.id])} aria-label="Restore"><ArchiveRestore size={16} /></button></Tooltip>
                        <Tooltip text="Delete"><button className="icon-btn icon-btn--delete" onClick={() => deleteMutation.mutate([s.id])} aria-label="Delete"><Trash2 size={16} /></button></Tooltip>
                      </>
                    ))}
                  </td>
                </tr>
              )
            })}

            {!isLoading && displayedRows.length === 0 && (
              <tr>
                <td colSpan={colCount} style={{ textAlign: 'center', padding: '2rem' }}>
                  {rows.length === 0
                    ? `No ${isCancelled ? 'cancelled ' : ''}subscriptions.`
                    : 'No subscriptions match your search.'}
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
                <td className="amount-col col-center">${totalYear.toFixed(2)}</td>
                <td className="amount-col col-center">${totalMonth.toFixed(2)}</td>
                <td></td>
                {isCancelled && <td></td>}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <RecordModal
        dialogRef={newDialogRef}
        title="New subscription"
        onSave={() => createMutation.mutate(newRow)}
        saving={createMutation.isPending}
        canSave={newRow.service.trim() !== ''}
      >
        <ModalField label="Service">
          <input value={newRow.service} autoFocus placeholder="Service"
            onChange={(e) => setNewRow({ ...newRow, service: e.target.value })} />
        </ModalField>
        <ModalField label="Company">
          <input value={newRow.company} placeholder="Company"
            onChange={(e) => setNewRow({ ...newRow, company: e.target.value })} />
        </ModalField>
        <ModalField label="Category">
          <input list="subscription-categories-list" value={newRow.category} placeholder="Category"
            onChange={(e) => setNewRow({ ...newRow, category: e.target.value.toUpperCase() })} />
        </ModalField>
        <ModalField label="Price / year">
          <input type="number" step="0.01" min="0" value={newRow.priceYear} placeholder="0.00"
            onChange={(e) => setNewRow({ ...newRow, priceYear: e.target.value })} />
        </ModalField>
        <ModalField label="Price / month">
          <input type="number" step="0.01" min="0" value={newRow.priceMonth} placeholder="0.00"
            onChange={(e) => setNewRow({ ...newRow, priceMonth: e.target.value })} />
        </ModalField>
        <ModalField label="Renewal cycle">
          <select value={newRow.renewalCycle}
            onChange={(e) => setNewRow({ ...newRow, renewalCycle: e.target.value as Cycle })}>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </ModalField>
        <ModalField label={newRow.renewalCycle === 'monthly' ? 'Renewal day' : 'Renewal date'}>
          {newRow.renewalCycle === 'monthly' ? (
            <select value={newRow.renewalDay} onChange={(e) => setNewRow({ ...newRow, renewalDay: e.target.value })}>
              <option value="">—</option>
              {DAYS.map((d) => <option key={d} value={String(d)}>{ordinal(d)}</option>)}
            </select>
          ) : (
            <input type="date" value={newRow.renewalDate}
              onChange={(e) => setNewRow({ ...newRow, renewalDate: e.target.value })} />
          )}
        </ModalField>
      </RecordModal>
    </div>
  )
}
