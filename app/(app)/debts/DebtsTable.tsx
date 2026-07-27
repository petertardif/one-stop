'use client'

import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import {
  Pencil, Check, X, Trash2, ChevronUp, ChevronDown, ChevronRight, Search, CalendarPlus, Plus,
  Archive, ArchiveRestore,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@/components/Spinner'
import { RecordModal, ModalField } from '@/components/RecordModal'
import { DebtCharts } from './DebtCharts'
import { DebtAccount, DebtsResponse, Term, totalPaidOff } from './types'
import { Tooltip } from '@/components/Tooltip'

type Tab = 'short' | 'long' | 'paid'
type SortKey = 'name' | 'category' | 'latest' | 'change' | 'latestDate' | 'term'

interface FormState {
  name: string
  category: string
  term: Term
  // New-row only: the debt's opening balance, recorded as its first snapshot.
  balance: string
  as_of: string
}

const DEBT_CATEGORIES = ['MORTGAGE', 'CAR LOAN', 'STUDENT LOAN', 'CREDIT CARD', 'PERSONAL LOAN', 'MEDICAL', 'TAXES', 'OTHER']

// Local calendar date (not UTC) as YYYY-MM-DD, so a late-evening entry doesn't
// get stamped with tomorrow's date.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyForm = (term: Term): FormState => ({ name: '', category: '', term, balance: '', as_of: todayStr() })
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// latest balance + change vs the prior snapshot (rows are newest-first).
function derive(d: DebtAccount): { latest: number | null; change: number | null; latestDate: string | null } {
  if (d.snapshots.length === 0) return { latest: null, change: null, latestDate: null }
  const latest = parseFloat(d.snapshots[0].balance)
  const change = d.snapshots.length > 1 ? latest - parseFloat(d.snapshots[1].balance) : null
  return { latest, change, latestDate: d.snapshots[0].as_of.slice(0, 10) }
}

export function DebtsTable({ role }: { role: string }) {
  const qc = useQueryClient()
  const canWrite = role === 'admin'
  const [tab, setTab] = useState<Tab>('short')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm('short'))
  const [newRow, setNewRow] = useState<FormState>(emptyForm('short'))
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  // New-debt + add-snapshot-date modals
  const newDialogRef = useRef<HTMLDialogElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [snapDate, setSnapDate] = useState('')
  const [snapValues, setSnapValues] = useState<Record<string, string>>({})
  // Inline snapshot-cell editing (in the drill-down)
  const [editSnap, setEditSnap] = useState<{ debtId: string; snapId: string } | null>(null)
  const [editSnapVal, setEditSnapVal] = useState('')

  const { data, isLoading } = useQuery<DebtsResponse>({
    queryKey: ['debts'],
    queryFn: async () => {
      const res = await fetch('/api/debts')
      if (!res.ok) throw new Error('Failed to fetch debts')
      return res.json()
    },
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setEditingId(null); setEditSnap(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['debts'] })

  const bodyOf = (f: FormState) => ({ name: f.name, category: f.category || null, term: f.term })

  const createMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const body = {
        ...bodyOf(f),
        balance: f.balance.trim() === '' ? null : parseFloat(f.balance),
        as_of: f.as_of || todayStr(),
      }
      const res = await fetch('/api/debts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to create debt')
    },
    onSuccess: (_r, f) => { invalidate(); newDialogRef.current?.close(); setNewRow(emptyForm(f.term)) },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: FormState }) => {
      const res = await fetch(`/api/debts/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyOf(f)),
      })
      if (!res.ok) throw new Error('Failed to update debt')
    },
    onSuccess: () => { invalidate(); setEditingId(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => fetch(`/api/debts/${id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error('Failed to delete debt')
      })))
    },
    onSuccess: () => { invalidate(); setSelectedIds(new Set()) },
  })

  const markPaidMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/debts/mark-paid', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Failed to mark debt paid')
    },
    onSuccess: () => { invalidate(); setSelectedIds(new Set()) },
  })

  const restoreMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/debts/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Failed to restore debt')
    },
    onSuccess: () => { invalidate(); setSelectedIds(new Set()) },
  })

  const snapshotMutation = useMutation({
    mutationFn: async (payload: { as_of: string; values: { debt_account_id: string; balance: number | null }[] }) => {
      const res = await fetch('/api/debts/snapshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save snapshot')
    },
    onSuccess: () => invalidate(),
  })

  const deleteSnapMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/debts/snapshots/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete snapshot')
    },
    onSuccess: () => invalidate(),
  })

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await fetch('/api/debts/reorder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: orderedIds }),
      })
      if (!res.ok) throw new Error('Failed to reorder debts')
    },
    onMutate: async (orderedIds: string[]) => {
      await qc.cancelQueries({ queryKey: ['debts'] })
      const prev = qc.getQueryData<DebtsResponse>(['debts'])
      if (prev) {
        const byId = new Map(prev.rows.map((r) => [r.id, r]))
        const reordered = orderedIds.map((id) => byId.get(id)).filter((r): r is DebtAccount => Boolean(r))
        qc.setQueryData<DebtsResponse>(['debts'], { ...prev, rows: reordered })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['debts'], ctx.prev) },
    onSettled: () => invalidate(),
  })

  const rows = data?.rows ?? []
  const paidTab = tab === 'paid'
  const colCount = 8

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(DEBT_CATEGORIES)
    for (const c of data?.categories ?? []) set.add(c)
    return Array.from(set).sort()
  }, [data?.categories])

  // Rows for the active tab drive both the table and the charts.
  const tabRows = useMemo(
    () => rows.filter((r) => (paidTab ? r.paid_at != null : r.paid_at == null && r.term === tab)),
    [rows, tab, paidTab]
  )

  const displayedRows = useMemo(() => {
    let list = tabRows
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        (r.category ?? '').toLowerCase().includes(q))
    }
    if (sortKey) {
      const val = (r: DebtAccount): string | number => {
        switch (sortKey) {
          case 'name': return r.name.toLowerCase()
          case 'category': return (r.category ?? '').toLowerCase()
          case 'latest': return paidTab ? totalPaidOff(r) : (derive(r).latest ?? -Infinity)
          case 'change': return derive(r).change ?? -Infinity
          case 'latestDate': return derive(r).latestDate ?? ''
          case 'term': return r.term
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
  }, [tabRows, search, sortKey, sortDir])

  const reorderable = canWrite && !paidTab && !sortKey && !search.trim()

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortKey(null); setSortDir('asc') }
    } else { setSortKey(key); setSortDir('asc') }
  }

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const list = [...tabRows]
    const from = list.findIndex((r) => r.id === dragId)
    const to = list.findIndex((r) => r.id === targetId)
    setDragId(null)
    if (from === -1 || to === -1) return
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    // Splice the reordered term rows back into the full row order (other terms stay put).
    const tabIds = new Set(tabRows.map((r) => r.id))
    const queue = list.map((r) => r.id)
    let qi = 0
    const fullOrder = rows.map((r) => (tabIds.has(r.id) ? queue[qi++] : r.id))
    reorderMutation.mutate(fullOrder)
  }

  const grandTotal = displayedRows.reduce((s, r) => s + (paidTab ? totalPaidOff(r) : (derive(r).latest ?? 0)), 0)

  const changeTab = (t: Tab) => {
    setTab(t); setSelectedIds(new Set()); setEditingId(null)
    if (sortKey === 'term' && t !== 'paid') setSortKey(null)
    if (sortKey === 'change' && t === 'paid') setSortKey(null)
  }

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  const allSelected = displayedRows.length > 0 && displayedRows.every((r) => selectedIds.has(r.id))

  const sortIndicator = (k: SortKey) =>
    sortKey === k ? (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : null
  const sortableTh = (k: SortKey, content: React.ReactNode, className?: string) => (
    <th className={['sortable', className].filter(Boolean).join(' ')} onClick={() => toggleSort(k)}
        aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <span className="th-sort">{content}{sortIndicator(k)}</span>
    </th>
  )

  const startEdit = (d: DebtAccount) => {
    setEditingId(d.id)
    setForm({ ...emptyForm(d.term), name: d.name, category: d.category ?? '' })
  }

  const openSnapshotModal = () => {
    setSnapDate(todayStr())
    setSnapValues({})
    dialogRef.current?.showModal()
  }
  const submitSnapshots = () => {
    if (!snapDate) return
    const values = tabRows.map((r) => {
      const raw = snapValues[r.id]
      return { debt_account_id: r.id, balance: raw != null && raw.trim() !== '' ? parseFloat(raw) : null }
    }).filter((v) => v.balance !== null)
    if (values.length === 0) { dialogRef.current?.close(); return }
    snapshotMutation.mutate({ as_of: snapDate, values }, { onSuccess: () => dialogRef.current?.close() })
  }

  const saveSnapEdit = (d: DebtAccount, snap: { id: string; as_of: string }) => {
    const v = editSnapVal.trim() === '' ? null : parseFloat(editSnapVal)
    snapshotMutation.mutate(
      { as_of: snap.as_of.slice(0, 10), values: [{ debt_account_id: d.id, balance: v }] },
      { onSuccess: () => setEditSnap(null) }
    )
  }

  const openNewDebtModal = () => {
    setNewRow(emptyForm(tab as Term))
    newDialogRef.current?.showModal()
  }

  // Editable cells for the inline editing row — name / category / term only.
  // Balances live in the row's drill-down, not here.
  const formCells = (state: FormState, set: (f: FormState) => void) => (
    <>
      <td><input value={state.name} onChange={(e) => set({ ...state, name: e.target.value })} placeholder="Debt name" /></td>
      <td><input list="debt-category-list" value={state.category} onChange={(e) => set({ ...state, category: e.target.value.toUpperCase() })} placeholder="Category" /></td>
      <td className="amount-col col-center">
        <select value={state.term} onChange={(e) => set({ ...state, term: e.target.value as Term })}>
          <option value="short">Short Term</option>
          <option value="long">Long Term</option>
        </select>
      </td>
      <td className="amount-col col-center">—</td>
      <td className="col-center">—</td>
    </>
  )

  return (
    <div className="monthly-ledger">
      <div className="ledger-header">
        <h1>Debts</h1>
      </div>

      <div className="account-tabs debts-tabs">
        <button className={tab === 'short' ? 'active' : ''} onClick={() => changeTab('short')}>Short Term</button>
        <button className={tab === 'long' ? 'active' : ''} onClick={() => changeTab('long')}>Long Term</button>
        <button className={tab === 'paid' ? 'active' : ''} onClick={() => changeTab('paid')}>Paid Off</button>
      </div>

      {isLoading && <Spinner />}

      {!isLoading && <DebtCharts rows={tabRows} paidTab={paidTab} />}

      <datalist id="debt-category-list">{categoryOptions.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="ledger-controls">
        <div className="ledger-search">
          <Search size={14} />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search debts…" aria-label="Search debts" />
        </div>

        {canWrite && (
          <div className="ledger-actions">
            {!paidTab ? (
              <>
                <button className="primary" onClick={openNewDebtModal}><Plus size={14} /> New Debt</button>
                <button onClick={openSnapshotModal}><CalendarPlus size={14} /> Add snapshot date</button>
                <button onClick={() => markPaidMutation.mutate(Array.from(selectedIds))} disabled={selectedIds.size === 0 || markPaidMutation.isPending}><Archive size={14} /> Mark as Paid</button>
                <button onClick={() => deleteMutation.mutate(Array.from(selectedIds))} disabled={selectedIds.size === 0 || deleteMutation.isPending}><Trash2 size={14} /> Delete</button>
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

      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th className="col-center">
                {canWrite && (
                  <input type="checkbox" checked={allSelected}
                    onChange={(e) => setSelectedIds(e.target.checked ? new Set(displayedRows.map((r) => r.id)) : new Set())}
                    aria-label="Select all" />
                )}
              </th>
              <th></th>
              {sortableTh('name', 'Name')}
              {sortableTh('category', 'Category')}
              {sortableTh('latest', paidTab ? 'Total Paid Off' : 'Latest Balance', 'amount-col col-center')}
              {!paidTab && sortableTh('change', 'Change', 'amount-col col-center')}
              {sortableTh('latestDate', 'Latest Date', 'col-center')}
              {paidTab && sortableTh('term', 'Type', 'col-center')}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((d) => {
              const { latest, change, latestDate } = derive(d)
              if (editingId === d.id) {
                return (
                  <tr key={d.id} className="editing-row">
                    <td></td>
                    <td></td>
                    {formCells(form, setForm)}
                    <td>
                      <button className="icon-btn icon-btn--save" onClick={() => updateMutation.mutate({ id: d.id, f: form })} aria-label="Save"><Check size={16} /></button>
                      <button className="icon-btn icon-btn--cancel" onClick={() => setEditingId(null)} aria-label="Cancel"><X size={16} /></button>
                    </td>
                  </tr>
                )
              }
              const expanded = expandedId === d.id
              // For debts, a falling balance (paying down) is good → green; a rising balance is red.
              const changeClass = change == null || change === 0 ? '' : change < 0 ? 'positive' : 'negative'
              return (
                <Fragment key={d.id}>
                  <tr
                    className={[reorderable ? 'draggable-row' : '', dragId === d.id ? 'dragging' : ''].filter(Boolean).join(' ') || undefined}
                    draggable={reorderable}
                    onDragStart={reorderable ? () => setDragId(d.id) : undefined}
                    onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
                    onDrop={reorderable ? () => handleDrop(d.id) : undefined}
                    onDragEnd={reorderable ? () => setDragId(null) : undefined}>
                    <td className="col-center">
                      {canWrite && <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleSelect(d.id)} />}
                    </td>
                    <td className="col-center">
                      <button className="icon-btn inv-expand" onClick={() => setExpandedId(expanded ? null : d.id)}
                        aria-label={expanded ? 'Collapse' : 'Expand'} aria-expanded={expanded}>
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td>{d.name}</td>
                    <td>{d.category ?? ''}</td>
                    <td className="amount-col col-center">
                      {paidTab ? money(totalPaidOff(d)) : (latest != null ? money(latest) : '—')}
                    </td>
                    {!paidTab && (
                      <td className={['amount-col col-center', changeClass].filter(Boolean).join(' ')}>
                        {change != null ? `${change >= 0 ? '+' : '−'}${money(Math.abs(change))}` : '—'}
                      </td>
                    )}
                    <td className="col-center">{latestDate ?? '—'}</td>
                    {paidTab && <td className="col-center">{d.term === 'short' ? 'Short' : 'Long'}</td>}
                    <td>
                      {canWrite && (!paidTab ? (
                        <>
                          <button className="icon-btn icon-btn--edit" onClick={() => startEdit(d)} aria-label="Edit"><Pencil size={16} /></button>
                          <Tooltip text="Mark as Paid"><button className="icon-btn icon-btn--edit" onClick={() => markPaidMutation.mutate([d.id])} aria-label="Mark as Paid"><Archive size={16} /></button></Tooltip>
                          <Tooltip text="Delete"><button className="icon-btn icon-btn--delete" onClick={() => deleteMutation.mutate([d.id])} aria-label="Delete"><Trash2 size={16} /></button></Tooltip>
                        </>
                      ) : (
                        <>
                          <Tooltip text="Restore"><button className="icon-btn icon-btn--edit" onClick={() => restoreMutation.mutate([d.id])} aria-label="Restore"><ArchiveRestore size={16} /></button></Tooltip>
                          <Tooltip text="Delete"><button className="icon-btn icon-btn--delete" onClick={() => deleteMutation.mutate([d.id])} aria-label="Delete"><Trash2 size={16} /></button></Tooltip>
                        </>
                      ))}
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="inv-detail-row">
                      <td></td>
                      <td></td>
                      <td colSpan={6}>
                        <div className="inv-detail">
                          <div className="inv-detail-history">
                            <h3>Balance history</h3>
                            {d.snapshots.length === 0 ? (
                              <p className="inv-detail-empty">No balances yet. Use “Add snapshot date”.</p>
                            ) : (
                              <table className="inv-history-table">
                                <thead><tr><th>Date</th><th className="amount-col col-center">Balance</th>{canWrite && <th></th>}</tr></thead>
                                <tbody>
                                  {d.snapshots.map((s) => {
                                    const isEd = editSnap?.debtId === d.id && editSnap?.snapId === s.id
                                    return (
                                      <tr key={s.id}>
                                        <td>{s.as_of.slice(0, 10)}</td>
                                        <td className="amount-col col-center">
                                          {isEd ? (
                                            <input type="number" step="0.01" min="0" value={editSnapVal} autoFocus
                                              onChange={(e) => setEditSnapVal(e.target.value)}
                                              onKeyDown={(e) => { if (e.key === 'Enter') saveSnapEdit(d, s) }} />
                                          ) : money(parseFloat(s.balance))}
                                        </td>
                                        {canWrite && (
                                          <td>
                                            {isEd ? (
                                              <>
                                                <button className="icon-btn icon-btn--save" onClick={() => saveSnapEdit(d, s)} aria-label="Save"><Check size={15} /></button>
                                                <button className="icon-btn icon-btn--cancel" onClick={() => setEditSnap(null)} aria-label="Cancel"><X size={15} /></button>
                                              </>
                                            ) : (
                                              <>
                                                <button className="icon-btn icon-btn--edit" onClick={() => { setEditSnap({ debtId: d.id, snapId: s.id }); setEditSnapVal(parseFloat(s.balance).toString()) }} aria-label="Edit value"><Pencil size={15} /></button>
                                                <button className="icon-btn icon-btn--delete" onClick={() => deleteSnapMutation.mutate(s.id)} aria-label="Delete snapshot"><Trash2 size={15} /></button>
                                              </>
                                            )}
                                          </td>
                                        )}
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}

            {!isLoading && displayedRows.length === 0 && (
              <tr><td colSpan={colCount} style={{ textAlign: 'center', padding: '2rem' }}>
                {tabRows.length === 0
                  ? (paidTab ? 'No paid-off debts.' : 'No debts in this term yet.')
                  : 'No debts match your search.'}
              </td></tr>
            )}
          </tbody>
          {displayedRows.length > 0 && (
            <tfoot>
              <tr className="budget-total-row">
                <td></td><td></td><td>Total</td><td></td>
                <td className="amount-col col-center">{money(grandTotal)}</td>
                <td></td><td></td><td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <RecordModal
        dialogRef={newDialogRef}
        title="New debt"
        onSave={() => createMutation.mutate(newRow)}
        saving={createMutation.isPending}
        canSave={newRow.name.trim() !== ''}
      >
        <ModalField label="Name" full>
          <input value={newRow.name} autoFocus placeholder="Debt name"
            onChange={(e) => setNewRow({ ...newRow, name: e.target.value })} />
        </ModalField>
        <ModalField label="Category">
          <input list="debt-category-list" value={newRow.category} placeholder="Category"
            onChange={(e) => setNewRow({ ...newRow, category: e.target.value.toUpperCase() })} />
        </ModalField>
        <ModalField label="Term">
          <select value={newRow.term} onChange={(e) => setNewRow({ ...newRow, term: e.target.value as Term })}>
            <option value="short">Short Term</option>
            <option value="long">Long Term</option>
          </select>
        </ModalField>
        <ModalField label="Balance">
          <input type="number" step="0.01" min="0" value={newRow.balance} placeholder="0.00"
            onChange={(e) => setNewRow({ ...newRow, balance: e.target.value })} />
        </ModalField>
        <ModalField label="Balance date">
          <input type="date" value={newRow.as_of}
            onChange={(e) => setNewRow({ ...newRow, as_of: e.target.value })} />
        </ModalField>
      </RecordModal>

      <dialog ref={dialogRef} className="modal" onClick={(e) => { if (e.target === dialogRef.current) dialogRef.current?.close() }}>
        <div className="modal__content">
          <div className="modal__header">
            <h2>Add snapshot date</h2>
            <button className="modal__close" onClick={() => dialogRef.current?.close()} aria-label="Close"><X size={18} /></button>
          </div>
          <label className="inv-snap-date">
            <span>Date</span>
            <input type="date" value={snapDate} onChange={(e) => setSnapDate(e.target.value)} />
          </label>
          <div className="inv-snap-grid">
            {tabRows.map((r) => {
              const existing = r.snapshots.find((s) => s.as_of.slice(0, 10) === snapDate)
              return (
                <label key={r.id} className="inv-snap-item">
                  <span>{r.name}{r.category ? ` · ${r.category}` : ''}</span>
                  <input type="number" step="0.01" min="0"
                    placeholder={existing ? parseFloat(existing.balance).toFixed(2) : '—'}
                    value={snapValues[r.id] ?? ''}
                    onChange={(e) => setSnapValues((prev) => ({ ...prev, [r.id]: e.target.value }))} />
                </label>
              )
            })}
          </div>
          <div className="modal__actions">
            <button className="btn-secondary" onClick={() => dialogRef.current?.close()}>Cancel</button>
            <button className="btn-primary" onClick={submitSnapshots} disabled={snapshotMutation.isPending || !snapDate}>
              {snapshotMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
