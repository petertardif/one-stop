'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Archive, ArchiveRestore, Info, ChevronUp, ChevronDown, Search, Plus, ListPlus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@/components/Spinner'
import { RecordModal, ModalField } from '@/components/RecordModal'
import { Tooltip } from '@/components/Tooltip'

type Duration = 'annual' | 'monthly' | 'biweekly' | 'weekly'
type PayType = 'autopay' | 'manual'

interface BudgetItem {
  id: string
  description: string
  due_date: string | null
  pay_type: PayType
  duration: Duration
  amount: string
  category: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

// Columns that carry per-row data are sortable (Actions, the checkbox, and the
// aggregate-only Monthly Average are not).
type SortKey = 'description' | 'category' | 'due_date' | 'pay_type' | 'duration' | 'annual' | 'next_monthly'

interface BudgetResponse {
  items: BudgetItem[]
  monthly_average: string
  categories: string[]
}

interface FormState {
  description: string
  due_date: string
  pay_type: PayType
  duration: Duration
  amount: string
  category: string
}

// Default budget taxonomy (free-form: users may also type new categories).
const BUDGET_CATEGORIES = [
  'HOUSING', 'UTILITIES', 'TAXES', 'INSURANCE', 'DEBT', 'SAVINGS', 'INVESTMENTS',
  'SUBSCRIPTIONS', 'KIDS', 'AUTO', 'HEALTHCARE', 'CHARITY', 'PETS', 'GROCERIES',
]

const MULTIPLIER: Record<Duration, number> = { annual: 1, monthly: 12, biweekly: 26, weekly: 52 }
const DURATION_LABEL: Record<Duration, string> = {
  annual: 'Annual', monthly: 'Monthly', biweekly: 'Bi-Weekly', weekly: 'Weekly',
}
const AUTO_MANUAL_HINT =
  'The Auto/Manual column should only take values Autopay or Manual. This means they are on autopay or a manual transaction.'

const EMPTY_FORM: FormState = { description: '', due_date: '', pay_type: 'manual', duration: 'monthly', amount: '', category: '' }

const annualOf = (amount: number, duration: Duration) => amount * MULTIPLIER[duration]
const nextMonthlyOf = (amount: number, duration: Duration) => annualOf(amount, duration) / 12
const money = (n: number) => `$${n.toFixed(2)}`

// Due Date is a day-of-month (1–31); on "Add to Ledger" a day past the target
// month's length falls back to that month's last day (e.g. 31 → Feb 28/29).
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}
const dueLabel = (v: string | null) => {
  if (!v) return ''
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? v : ordinal(n)
}

// Add-to-Ledger month picker: last month through five months out (default next).
function monthChoices(): { value: string; label: string }[] {
  const now = new Date()
  const out: { value: string; label: string }[] = []
  for (let i = -1; i <= 5; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    out.push({ value: monthValue(d), label: monthLabel(monthValue(d)) })
  }
  return out
}
const monthValue = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const nextMonthValue = () => { const d = new Date(); return monthValue(new Date(d.getFullYear(), d.getMonth() + 1, 1)) }
const monthLabel = (value: string) => {
  const [y, m] = value.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}
// The item's post date within the chosen month (due-day clamped), e.g. "Aug 15".
const postDateLabel = (dueDate: string | null, month: string) => {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const day = parseInt(dueDate ?? '', 10)
  const clamped = Number.isNaN(day) ? 1 : Math.min(Math.max(day, 1), lastDay)
  return new Date(y, m - 1, clamped).toLocaleString('default', { month: 'short', day: 'numeric' })
}

export function BudgetTable({ role }: { role: string }) {
  const qc = useQueryClient()
  const router = useRouter()
  const canWrite = role === 'admin'
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [newRow, setNewRow] = useState<FormState>(EMPTY_FORM)
  const newDialogRef = useRef<HTMLDialogElement>(null)
  const ledgerDialogRef = useRef<HTMLDialogElement>(null)
  const [ledgerMonth, setLedgerMonth] = useState<string>(nextMonthValue)
  const [ledgerStatus, setLedgerStatus] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  const { data, isLoading } = useQuery<BudgetResponse>({
    queryKey: ['budget-items', view],
    queryFn: async () => {
      const res = await fetch(`/api/budget-items?archived=${view === 'archived'}`)
      if (!res.ok) throw new Error('Failed to fetch budget items')
      return res.json()
    },
  })

  useEffect(() => {
    setSelectedIds(new Set())
    setEditingId(null)
    newDialogRef.current?.close()
  }, [view])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['budget-items'] })

  const createMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const res = await fetch('/api/budget-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, due_date: f.due_date || null, amount: parseFloat(f.amount) }),
      })
      if (!res.ok) throw new Error('Failed to create budget item')
    },
    onSuccess: () => { invalidate(); newDialogRef.current?.close(); setNewRow(EMPTY_FORM) },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/budget-items/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update budget item')
    },
    onSuccess: () => { invalidate(); setEditingId(null) },
  })

  const addToLedgerMutation = useMutation({
    mutationFn: async ({ ids, month }: { ids: string[]; month: string }) => {
      const res = await fetch('/api/budget-items/add-to-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, month }),
      })
      if (!res.ok) throw new Error('Failed to add to ledger')
      return res.json() as Promise<{ posted: number; skipped: number }>
    },
    onSuccess: ({ posted, skipped }) => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      setSelectedIds(new Set())
      ledgerDialogRef.current?.close()
      setLedgerStatus(
        `Added ${posted} bill${posted === 1 ? '' : 's'} to the ledger for ${monthLabel(ledgerMonth)}` +
          (skipped ? `; skipped ${skipped} already added that month.` : '.')
      )
      // Redirect to the ledger, opened on the month the bills were posted to.
      router.push(`/monthly?period=${ledgerMonth}`)
    },
  })

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await fetch('/api/budget-items/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: orderedIds }),
      })
      if (!res.ok) throw new Error('Failed to reorder budget items')
    },
    onMutate: async (orderedIds: string[]) => {
      await qc.cancelQueries({ queryKey: ['budget-items', view] })
      const prev = qc.getQueryData<BudgetResponse>(['budget-items', view])
      if (prev) {
        const byId = new Map(prev.items.map((i) => [i.id, i]))
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((i): i is BudgetItem => Boolean(i))
        qc.setQueryData<BudgetResponse>(['budget-items', view], { ...prev, items: reordered })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['budget-items', view], ctx.prev)
    },
    onSettled: () => invalidate(),
  })

  const items = data?.items ?? []
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  // Search + category filter + optional column sort. When no column sort is
  // active, rows stay in their persisted manual (drag) order.
  const displayedItems = useMemo(() => {
    let list = items
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (i) =>
          i.description.toLowerCase().includes(q) ||
          (i.category ?? '').toLowerCase().includes(q)
      )
    }
    if (categoryFilter) list = list.filter((i) => (i.category ?? '') === categoryFilter)
    if (sortKey) {
      const val = (i: BudgetItem): string | number => {
        const amt = parseFloat(i.amount) || 0
        switch (sortKey) {
          case 'description': return i.description.toLowerCase()
          case 'category': return (i.category ?? '').toLowerCase()
          case 'due_date': return i.due_date ? parseInt(i.due_date, 10) : Infinity
          case 'pay_type': return i.pay_type
          case 'duration': return MULTIPLIER[i.duration]
          case 'annual': return annualOf(amt, i.duration)
          case 'next_monthly': return nextMonthlyOf(amt, i.duration)
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
  }, [items, search, categoryFilter, sortKey, sortDir])

  // Dragging only makes sense against the full, unsorted, unfiltered list —
  // otherwise the persisted order would be ambiguous.
  const reorderable = canWrite && !sortKey && !search.trim() && !categoryFilter

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
    const ordered = [...items]
    const from = ordered.findIndex((i) => i.id === dragId)
    const to = ordered.findIndex((i) => i.id === targetId)
    setDragId(null)
    if (from === -1 || to === -1) return
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved)
    reorderMutation.mutate(ordered.map((i) => i.id))
  }

  const allSelected = displayedItems.length > 0 && displayedItems.every((i) => selectedIds.has(i.id))

  const startEdit = (item: BudgetItem) => {
    setEditingId(item.id)
    setForm({
      description: item.description,
      due_date: item.due_date ?? '',
      pay_type: item.pay_type,
      duration: item.duration,
      amount: parseFloat(item.amount).toString(),
      category: item.category ?? '',
    })
  }
  const saveEdit = () =>
    updateMutation.mutate({
      id: editingId!,
      body: { ...form, due_date: form.due_date || null, amount: parseFloat(form.amount) },
    })

  const totalAnnual = displayedItems.reduce((s, i) => s + annualOf(parseFloat(i.amount), i.duration), 0)
  const totalNextMonthly = displayedItems.reduce((s, i) => s + nextMonthlyOf(parseFloat(i.amount), i.duration), 0)
  const monthlyAverage = data ? parseFloat(data.monthly_average) : 0
  const categoryOptions = Array.from(new Set([...BUDGET_CATEGORIES, ...(data?.categories ?? [])])).sort()

  // The selected bills previewed in the Add-to-Ledger modal, and their total.
  const ledgerItems = (data?.items ?? []).filter((i) => selectedIds.has(i.id))
  const ledgerTotal = ledgerItems.reduce((s, i) => s + nextMonthlyOf(parseFloat(i.amount), i.duration), 0)

  // Inline form cells reused by the new row and the editing row.
  const openNewModal = () => {
    setNewRow(EMPTY_FORM)
    setLedgerStatus(null)
    newDialogRef.current?.showModal()
  }

  const openLedgerModal = () => {
    setLedgerMonth(nextMonthValue())
    setLedgerStatus(null)
    ledgerDialogRef.current?.showModal()
  }

  const formCells = (state: FormState, set: (f: FormState) => void) => {
    const amt = parseFloat(state.amount) || 0
    return (
      <>
        <td>
          <input value={state.description} onChange={(e) => set({ ...state, description: e.target.value })} placeholder="Description" />
        </td>
        <td>
          <input
            list="budget-categories-list"
            value={state.category}
            onChange={(e) => set({ ...state, category: e.target.value.toUpperCase() })}
            placeholder="Category"
          />
        </td>
        <td>
          <select value={state.due_date} onChange={(e) => set({ ...state, due_date: e.target.value })}>
            <option value="">—</option>
            {DAYS.map((d) => <option key={d} value={String(d)}>{ordinal(d)}</option>)}
          </select>
        </td>
        <td>
          <select value={state.pay_type} onChange={(e) => set({ ...state, pay_type: e.target.value as PayType })}>
            <option value="autopay">Autopay</option>
            <option value="manual">Manual</option>
          </select>
        </td>
        <td>
          <select value={state.duration} onChange={(e) => set({ ...state, duration: e.target.value as Duration })}>
            {(Object.keys(DURATION_LABEL) as Duration[]).map((d) => (
              <option key={d} value={d}>{DURATION_LABEL[d]}</option>
            ))}
          </select>
        </td>
        <td className="amount-col col-center">
          <input type="number" step="0.01" min="0" value={state.amount} onChange={(e) => set({ ...state, amount: e.target.value })} placeholder="Price" />
        </td>
        <td className="amount-col col-center">—</td>
        <td className="amount-col col-center">{money(nextMonthlyOf(amt, state.duration))}</td>
      </>
    )
  }

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

  return (
    <div className="monthly-ledger">
      <div className="ledger-header">
        <h1>Budget</h1>

        <div className="ledger-controls">
          <div className="account-tabs">
            <button className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>Active</button>
            <button className={view === 'archived' ? 'active' : ''} onClick={() => setView('archived')}>Archived</button>
          </div>

          <div className="ledger-search">
            <Search size={14} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search budget…"
              aria-label="Search budget items"
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

          {canWrite && view === 'active' && (
            <div className="ledger-actions">
              <button className="primary" onClick={openNewModal}><Plus size={14} /> Add</button>
              <button onClick={openLedgerModal} disabled={selectedIds.size === 0}>
                <ListPlus size={14} /> Add to Ledger
              </button>
            </div>
          )}
        </div>

        {ledgerStatus && <p className="budget-status">{ledgerStatus}</p>}
      </div>

      {isLoading && <Spinner />}

      <datalist id="budget-categories-list">
        {categoryOptions.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th className="col-center">
                {view === 'active' && canWrite && (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => setSelectedIds(e.target.checked ? new Set(displayedItems.map((i) => i.id)) : new Set())}
                    aria-label="Select all"
                  />
                )}
              </th>
              {sortableTh('description', 'Description')}
              {sortableTh('category', 'Category')}
              {sortableTh('due_date', 'Due Date')}
              {sortableTh('pay_type', (
                <>Auto/Manual{' '}
                <Tooltip text={AUTO_MANUAL_HINT}><span className="notes-icon"><Info size={13} /></span></Tooltip></>
              ), 'col-center')}
              {sortableTh('duration', 'Duration')}
              {sortableTh('annual', <>Annual ($)</>, 'amount-col col-center')}
              <th className="amount-col col-center">Monthly<br />Average ($)</th>
              {sortableTh('next_monthly', <>Next<br />Monthly ($)</>, 'amount-col col-center')}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedItems.map((item) => {
              const amt = parseFloat(item.amount)
              if (editingId === item.id) {
                return (
                  <tr key={item.id} className="editing-row">
                    <td></td>
                    {formCells(form, setForm)}
                    <td>
                      <button className="icon-btn icon-btn--save" onClick={saveEdit} aria-label="Save"><Check size={16} /></button>
                      <button className="icon-btn icon-btn--cancel" onClick={() => setEditingId(null)} aria-label="Cancel"><X size={16} /></button>
                    </td>
                  </tr>
                )
              }
              return (
                <tr
                  key={item.id}
                  className={[reorderable ? 'draggable-row' : '', dragId === item.id ? 'dragging' : ''].filter(Boolean).join(' ') || undefined}
                  draggable={reorderable}
                  onDragStart={reorderable ? () => setDragId(item.id) : undefined}
                  onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
                  onDrop={reorderable ? () => handleDrop(item.id) : undefined}
                  onDragEnd={reorderable ? () => setDragId(null) : undefined}
                >
                  <td className="col-center">
                    {view === 'active' && canWrite && (
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} />
                    )}
                  </td>
                  <td>{item.description}</td>
                  <td>{item.category ?? ''}</td>
                  <td>{dueLabel(item.due_date)}</td>
                  <td className="col-center">{item.pay_type === 'autopay' ? 'Autopay' : 'Manual'}</td>
                  <td>{DURATION_LABEL[item.duration]}</td>
                  <td className="amount-col col-center">{money(annualOf(amt, item.duration))}</td>
                  <td className="amount-col col-center">—</td>
                  <td className="amount-col col-center">{money(nextMonthlyOf(amt, item.duration))}</td>
                  <td>
                    {canWrite && (view === 'active' ? (
                      <>
                        <button className="icon-btn icon-btn--edit" onClick={() => startEdit(item)} aria-label="Edit"><Pencil size={16} /></button>
                        <button className="icon-btn icon-btn--delete" onClick={() => updateMutation.mutate({ id: item.id, body: { archived: true } })} aria-label="Archive"><Archive size={16} /></button>
                      </>
                    ) : (
                      <button className="icon-btn icon-btn--save" onClick={() => updateMutation.mutate({ id: item.id, body: { archived: false } })} aria-label="Restore"><ArchiveRestore size={16} /></button>
                    ))}
                  </td>
                </tr>
              )
            })}

            {!isLoading && displayedItems.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>
                  {items.length === 0
                    ? `No ${view === 'archived' ? 'archived ' : ''}budget items.`
                    : 'No budget items match your search.'}
                </td>
              </tr>
            )}
          </tbody>
          {displayedItems.length > 0 && (
            <tfoot>
              <tr className="budget-total-row">
                <td></td>
                <td>Total</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td className="amount-col col-center">{money(totalAnnual)}</td>
                <td className="amount-col col-center"><Tooltip text="Trailing 12-month MONTHLY BILLS spend ÷ 12"><span>{money(monthlyAverage)}</span></Tooltip></td>
                <td className="amount-col col-center">{money(totalNextMonthly)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <RecordModal
        dialogRef={newDialogRef}
        title="New budget item"
        onSave={() => createMutation.mutate(newRow)}
        saving={createMutation.isPending}
        canSave={newRow.description.trim() !== ''}
      >
        <ModalField label="Description" full>
          <input value={newRow.description} autoFocus placeholder="Description"
            onChange={(e) => setNewRow({ ...newRow, description: e.target.value })} />
        </ModalField>
        <ModalField label="Category">
          <input list="budget-categories-list" value={newRow.category} placeholder="Category"
            onChange={(e) => setNewRow({ ...newRow, category: e.target.value.toUpperCase() })} />
        </ModalField>
        <ModalField label="Due date">
          <select value={newRow.due_date} onChange={(e) => setNewRow({ ...newRow, due_date: e.target.value })}>
            <option value="">—</option>
            {DAYS.map((d) => <option key={d} value={String(d)}>{ordinal(d)}</option>)}
          </select>
        </ModalField>
        <ModalField label="Auto / Manual">
          <select value={newRow.pay_type} onChange={(e) => setNewRow({ ...newRow, pay_type: e.target.value as PayType })}>
            <option value="autopay">Autopay</option>
            <option value="manual">Manual</option>
          </select>
        </ModalField>
        <ModalField label="Duration">
          <select value={newRow.duration} onChange={(e) => setNewRow({ ...newRow, duration: e.target.value as Duration })}>
            {(Object.keys(DURATION_LABEL) as Duration[]).map((d) => (
              <option key={d} value={d}>{DURATION_LABEL[d]}</option>
            ))}
          </select>
        </ModalField>
        <ModalField label="Price">
          <input type="number" step="0.01" min="0" value={newRow.amount} placeholder="0.00"
            onChange={(e) => setNewRow({ ...newRow, amount: e.target.value })} />
        </ModalField>
        <ModalField label="Next monthly">
          <input value={money(nextMonthlyOf(parseFloat(newRow.amount) || 0, newRow.duration))} readOnly tabIndex={-1} />
        </ModalField>
      </RecordModal>

      {/* Add-to-Ledger preview modal: pick a month, review the bills, confirm. */}
      <dialog
        ref={ledgerDialogRef}
        className="modal"
        onClick={(e) => { if (e.target === ledgerDialogRef.current) ledgerDialogRef.current?.close() }}
      >
        <div className="modal__content">
          <div className="modal__header">
            <h2>Add to ledger</h2>
            <button className="modal__close" onClick={() => ledgerDialogRef.current?.close()} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="ledger-post">
            <label className="record-field">
              <span>Month</span>
              <select value={ledgerMonth} onChange={(e) => setLedgerMonth(e.target.value)}>
                {monthChoices().map((mo) => <option key={mo.value} value={mo.value}>{mo.label}</option>)}
              </select>
            </label>

            {ledgerItems.length === 0 ? (
              <p className="ledger-post__note">No bills selected.</p>
            ) : (
              <>
                <ul className="ledger-post__list">
                  {ledgerItems.map((i) => (
                    <li key={i.id}>
                      <span className="ledger-post__desc">{i.description}</span>
                      <span className="ledger-post__date">{postDateLabel(i.due_date, ledgerMonth)}</span>
                      <span className="ledger-post__amt">-{money(nextMonthlyOf(parseFloat(i.amount), i.duration))}</span>
                    </li>
                  ))}
                </ul>
                <div className="ledger-post__total">
                  <span>Total ({ledgerItems.length} bill{ledgerItems.length === 1 ? '' : 's'})</span>
                  <span>-{money(ledgerTotal)}</span>
                </div>
                <p className="ledger-post__note">Bills already posted to {monthLabel(ledgerMonth)} are skipped automatically. Each bill posts as a MONTHLY BILLS expense on its due date.</p>
              </>
            )}
          </div>
          <div className="modal__actions">
            <button className="btn-secondary" onClick={() => ledgerDialogRef.current?.close()}>Cancel</button>
            <button
              className="btn-primary"
              onClick={() => addToLedgerMutation.mutate({ ids: Array.from(selectedIds), month: ledgerMonth })}
              disabled={addToLedgerMutation.isPending || ledgerItems.length === 0}
            >
              {addToLedgerMutation.isPending ? 'Adding…' : `Add ${ledgerItems.length} to ledger`}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
