'use client'

import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import {
  Pencil, Check, X, Trash2, ChevronUp, ChevronDown, ChevronRight, Search, Plus, CalendarPlus,
  Archive, ArchiveRestore,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@/components/Spinner'
import { InvestmentCharts } from './InvestmentCharts'
import { Investment, InvestmentsResponse, Cadence } from './types'
import { Tooltip } from '@/components/Tooltip'

type SortKey = 'brokerage' | 'type' | 'owner' | 'type_description' | 'contribution' | 'latest' | 'change'

interface FormState {
  brokerage: string
  type: string
  owner: string
  typeDescription: string
  cadence: Cadence
  amount: string
  note: string
  strategy: string
}

const INV_TYPES = ['Retirement', 'College', 'Savings']
const CADENCE_LABEL: Record<Cadence, string> = {
  none: 'None', weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly', annual: 'Annual',
}
const emptyForm = (): FormState => ({
  brokerage: '', type: '', owner: '', typeDescription: '',
  cadence: 'none', amount: '', note: '', strategy: '',
})
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// latest value + change vs the prior snapshot (rows are newest-first).
function derive(inv: Investment): { latest: number | null; change: number | null } {
  if (inv.snapshots.length === 0) return { latest: null, change: null }
  const latest = parseFloat(inv.snapshots[0].value)
  const change = inv.snapshots.length > 1 ? latest - parseFloat(inv.snapshots[1].value) : null
  return { latest, change }
}

export function InvestmentsTable({ role }: { role: string }) {
  const qc = useQueryClient()
  const canWrite = role === 'admin'
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [showNewRow, setShowNewRow] = useState(false)
  const [newRow, setNewRow] = useState<FormState>(emptyForm())
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [search, setSearch] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [tab, setTab] = useState<'active' | 'liquidated'>('active')

  // Add-snapshot-date modal
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [snapDate, setSnapDate] = useState('')
  const [snapValues, setSnapValues] = useState<Record<string, string>>({})
  // Inline snapshot-cell editing (in the drill-down)
  const [editSnap, setEditSnap] = useState<{ invId: string; snapId: string } | null>(null)
  const [editSnapVal, setEditSnapVal] = useState('')

  const { data, isLoading } = useQuery<InvestmentsResponse>({
    queryKey: ['investments'],
    queryFn: async () => {
      const res = await fetch('/api/investments')
      if (!res.ok) throw new Error('Failed to fetch investments')
      return res.json()
    },
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setEditingId(null); setShowNewRow(false); setEditSnap(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['investments'] })

  const bodyOf = (f: FormState) => ({
    brokerage: f.brokerage,
    type: f.type || null,
    owner: f.owner || null,
    type_description: f.typeDescription || null,
    contribution_cadence: f.cadence,
    contribution_amount: f.amount.trim() === '' ? null : parseFloat(f.amount),
    contribution_note: f.note || null,
    strategy: f.strategy || null,
  })

  const createMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const res = await fetch('/api/investments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyOf(f)),
      })
      if (!res.ok) throw new Error('Failed to create investment')
    },
    onSuccess: () => { invalidate(); setShowNewRow(false); setNewRow(emptyForm()) },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: FormState }) => {
      const res = await fetch(`/api/investments/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyOf(f)),
      })
      if (!res.ok) throw new Error('Failed to update investment')
    },
    onSuccess: () => { invalidate(); setEditingId(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => fetch(`/api/investments/${id}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error('Failed to delete investment')
      })))
    },
    onSuccess: () => { invalidate(); setSelectedIds(new Set()) },
  })

  const liquidateMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/investments/liquidate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Failed to liquidate investment')
    },
    onSuccess: () => { invalidate(); setSelectedIds(new Set()) },
  })

  const restoreMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/investments/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Failed to restore investment')
    },
    onSuccess: () => { invalidate(); setSelectedIds(new Set()) },
  })

  const snapshotMutation = useMutation({
    mutationFn: async (payload: { as_of: string; values: { investment_id: string; value: number | null }[] }) => {
      const res = await fetch('/api/investments/snapshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save snapshot')
    },
    onSuccess: () => invalidate(),
  })

  const deleteSnapMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/investments/snapshots/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete snapshot')
    },
    onSuccess: () => invalidate(),
  })

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await fetch('/api/investments/reorder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: orderedIds }),
      })
      if (!res.ok) throw new Error('Failed to reorder investments')
    },
    onMutate: async (orderedIds: string[]) => {
      await qc.cancelQueries({ queryKey: ['investments'] })
      const prev = qc.getQueryData<InvestmentsResponse>(['investments'])
      if (prev) {
        const byId = new Map(prev.rows.map((r) => [r.id, r]))
        const reordered = orderedIds.map((id) => byId.get(id)).filter((r): r is Investment => Boolean(r))
        qc.setQueryData<InvestmentsResponse>(['investments'], { ...prev, rows: reordered })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['investments'], ctx.prev) },
    onSettled: () => invalidate(),
  })

  const rows = data?.rows ?? []
  const liquidatedTab = tab === 'liquidated'
  const colCount = liquidatedTab ? 11 : 10
  const ownerOptions = Array.from(new Set(rows.map((r) => r.owner).filter((o): o is string => Boolean(o)))).sort()

  // Rows for the active tab drive both the table and the charts.
  const tabRows = useMemo(
    () => rows.filter((r) => (liquidatedTab ? r.liquidated_at != null : r.liquidated_at == null)),
    [rows, liquidatedTab]
  )

  const displayedRows = useMemo(() => {
    let list = tabRows
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        r.brokerage.toLowerCase().includes(q) ||
        (r.owner ?? '').toLowerCase().includes(q) ||
        (r.type ?? '').toLowerCase().includes(q) ||
        (r.type_description ?? '').toLowerCase().includes(q))
    }
    if (sortKey) {
      const val = (r: Investment): string | number => {
        switch (sortKey) {
          case 'brokerage': return r.brokerage.toLowerCase()
          case 'type': return (r.type ?? '').toLowerCase()
          case 'owner': return (r.owner ?? '').toLowerCase()
          case 'type_description': return (r.type_description ?? '').toLowerCase()
          case 'contribution': return r.contribution_amount != null ? parseFloat(r.contribution_amount) : -Infinity
          case 'latest': return derive(r).latest ?? -Infinity
          case 'change': return derive(r).change ?? -Infinity
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

  const reorderable = canWrite && !liquidatedTab && !sortKey && !search.trim()

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortKey(null); setSortDir('asc') }
    } else { setSortKey(key); setSortDir('asc') }
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

  const grandTotal = displayedRows.reduce((s, r) => s + (derive(r).latest ?? 0), 0)

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

  const startEdit = (inv: Investment) => {
    setEditingId(inv.id)
    setForm({
      brokerage: inv.brokerage,
      type: inv.type ?? '',
      owner: inv.owner ?? '',
      typeDescription: inv.type_description ?? '',
      cadence: inv.contribution_cadence,
      amount: inv.contribution_amount != null ? parseFloat(inv.contribution_amount).toString() : '',
      note: inv.contribution_note ?? '',
      strategy: inv.strategy ?? '',
    })
  }

  const openSnapshotModal = () => {
    const today = new Date().toISOString().slice(0, 10)
    setSnapDate(today)
    setSnapValues({})
    dialogRef.current?.showModal()
  }
  const submitSnapshots = () => {
    if (!snapDate) return
    const values = tabRows.map((r) => {
      const raw = snapValues[r.id]
      return { investment_id: r.id, value: raw != null && raw.trim() !== '' ? parseFloat(raw) : null }
    }).filter((v) => v.value !== null)
    if (values.length === 0) { dialogRef.current?.close(); return }
    snapshotMutation.mutate({ as_of: snapDate, values }, { onSuccess: () => dialogRef.current?.close() })
  }

  const saveSnapEdit = (inv: Investment, snap: { id: string; as_of: string }) => {
    const v = editSnapVal.trim() === '' ? null : parseFloat(editSnapVal)
    snapshotMutation.mutate(
      { as_of: snap.as_of.slice(0, 10), values: [{ investment_id: inv.id, value: v }] },
      { onSuccess: () => setEditSnap(null) }
    )
  }

  // Metadata cells shared by the new + editing rows.
  const formCells = (state: FormState, set: (f: FormState) => void) => (
    <>
      <td><input value={state.brokerage} onChange={(e) => set({ ...state, brokerage: e.target.value })} placeholder="Brokerage" /></td>
      <td><input list="inv-type-list" value={state.type} onChange={(e) => set({ ...state, type: e.target.value })} placeholder="Type" /></td>
      <td><input list="inv-owner-list" value={state.owner} onChange={(e) => set({ ...state, owner: e.target.value })} placeholder="Owner" /></td>
      <td><input value={state.typeDescription} onChange={(e) => set({ ...state, typeDescription: e.target.value })} placeholder="Description" /></td>
      <td>
        <div className="inv-contrib-edit">
          <select value={state.cadence} onChange={(e) => set({ ...state, cadence: e.target.value as Cadence })}>
            {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
          </select>
          <input type="number" step="0.01" min="0" value={state.amount} onChange={(e) => set({ ...state, amount: e.target.value })} placeholder="Amount" />
          <input value={state.note} onChange={(e) => set({ ...state, note: e.target.value })} placeholder="Note (optional)" />
        </div>
      </td>
      <td className="amount-col col-center">—</td>
      <td className="amount-col col-center">—</td>
    </>
  )

  return (
    <div className="monthly-ledger">
      <div className="ledger-header">
        <h1>Investments</h1>
      </div>

      {isLoading && <Spinner />}

      {!isLoading && <InvestmentCharts rows={tabRows} />}

      <datalist id="inv-type-list">{INV_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="inv-owner-list">{ownerOptions.map((o) => <option key={o} value={o} />)}</datalist>

      <div className="ledger-controls">
        <div className="account-tabs">
          <button className={tab === 'active' ? 'active' : ''} onClick={() => { setTab('active'); setSelectedIds(new Set()); setShowNewRow(false); setEditingId(null) }}>Active</button>
          <button className={tab === 'liquidated' ? 'active' : ''} onClick={() => { setTab('liquidated'); setSelectedIds(new Set()); setShowNewRow(false); setEditingId(null) }}>Liquidated</button>
        </div>

        <div className="ledger-search">
          <Search size={14} />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search investments…" aria-label="Search investments" />
        </div>

        {canWrite && (
          <div className="ledger-actions">
            {!liquidatedTab ? (
              <>
                <button className="primary" onClick={() => setShowNewRow(true)} disabled={showNewRow}><Plus size={14} /> New Investment</button>
                <button onClick={openSnapshotModal}><CalendarPlus size={14} /> Add snapshot date</button>
                <button onClick={() => liquidateMutation.mutate(Array.from(selectedIds))} disabled={selectedIds.size === 0 || liquidateMutation.isPending}><Archive size={14} /> Liquidate</button>
                <button onClick={() => deleteMutation.mutate(Array.from(selectedIds))} disabled={selectedIds.size === 0 || deleteMutation.isPending}><Trash2 size={14} /> Delete</button>
              </>
            ) : (
              <button onClick={() => restoreMutation.mutate(Array.from(selectedIds))} disabled={selectedIds.size === 0 || restoreMutation.isPending}><ArchiveRestore size={14} /> Restore</button>
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
              {sortableTh('brokerage', 'Brokerage')}
              {sortableTh('type', 'Type')}
              {sortableTh('owner', 'Owner')}
              {sortableTh('type_description', 'Description')}
              {sortableTh('contribution', 'Contribution')}
              {sortableTh('latest', 'Latest Value', 'amount-col col-center')}
              {sortableTh('change', 'Change', 'amount-col col-center')}
              {liquidatedTab && <th>Liquidated</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {showNewRow && canWrite && (
              <tr className="new-row">
                <td></td>
                <td></td>
                {formCells(newRow, setNewRow)}
                <td>
                  <button className="icon-btn icon-btn--save" onClick={() => createMutation.mutate(newRow)} aria-label="Save"><Check size={16} /></button>
                  <button className="icon-btn icon-btn--cancel" onClick={() => setShowNewRow(false)} aria-label="Cancel"><X size={16} /></button>
                </td>
              </tr>
            )}

            {displayedRows.map((inv) => {
              const { latest, change } = derive(inv)
              if (editingId === inv.id) {
                return (
                  <tr key={inv.id} className="editing-row">
                    <td></td>
                    <td></td>
                    {formCells(form, setForm)}
                    <td>
                      <button className="icon-btn icon-btn--save" onClick={() => updateMutation.mutate({ id: inv.id, f: form })} aria-label="Save"><Check size={16} /></button>
                      <button className="icon-btn icon-btn--cancel" onClick={() => setEditingId(null)} aria-label="Cancel"><X size={16} /></button>
                    </td>
                  </tr>
                )
              }
              const expanded = expandedId === inv.id
              return (
                <Fragment key={inv.id}>
                  <tr
                    className={[reorderable ? 'draggable-row' : '', dragId === inv.id ? 'dragging' : ''].filter(Boolean).join(' ') || undefined}
                    draggable={reorderable}
                    onDragStart={reorderable ? () => setDragId(inv.id) : undefined}
                    onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
                    onDrop={reorderable ? () => handleDrop(inv.id) : undefined}
                    onDragEnd={reorderable ? () => setDragId(null) : undefined}>
                    <td className="col-center">
                      {canWrite && <input type="checkbox" checked={selectedIds.has(inv.id)} onChange={() => toggleSelect(inv.id)} />}
                    </td>
                    <td className="col-center">
                      <button className="icon-btn inv-expand" onClick={() => setExpandedId(expanded ? null : inv.id)}
                        aria-label={expanded ? 'Collapse' : 'Expand'} aria-expanded={expanded}>
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td>{inv.brokerage}</td>
                    <td>{inv.type ?? ''}</td>
                    <td>{inv.owner ?? ''}</td>
                    <td>{inv.type_description ?? ''}</td>
                    <td>
                      {inv.contribution_cadence === 'none' && !inv.contribution_amount ? '—' : (
                        <Tooltip text={inv.contribution_note ?? undefined}>
                          <span>
                            {CADENCE_LABEL[inv.contribution_cadence]}
                            {inv.contribution_amount != null ? ` · ${money(parseFloat(inv.contribution_amount))}` : ''}
                            {inv.contribution_note ? ' *' : ''}
                          </span>
                        </Tooltip>
                      )}
                    </td>
                    <td className="amount-col col-center">{latest != null ? money(latest) : '—'}</td>
                    <td className={['amount-col col-center', change != null ? (change >= 0 ? 'positive' : 'negative') : ''].filter(Boolean).join(' ')}>
                      {change != null ? `${change >= 0 ? '+' : '−'}${money(Math.abs(change))}` : '—'}
                    </td>
                    {liquidatedTab && <td>{inv.liquidated_at ? inv.liquidated_at.slice(0, 10) : ''}</td>}
                    <td>
                      {canWrite && (!liquidatedTab ? (
                        <>
                          <button className="icon-btn icon-btn--edit" onClick={() => startEdit(inv)} aria-label="Edit"><Pencil size={16} /></button>
                          <Tooltip text="Liquidate"><button className="icon-btn icon-btn--edit" onClick={() => liquidateMutation.mutate([inv.id])} aria-label="Liquidate"><Archive size={16} /></button></Tooltip>
                          <Tooltip text="Delete"><button className="icon-btn icon-btn--delete" onClick={() => deleteMutation.mutate([inv.id])} aria-label="Delete"><Trash2 size={16} /></button></Tooltip>
                        </>
                      ) : (
                        <Tooltip text="Restore"><button className="icon-btn icon-btn--edit" onClick={() => restoreMutation.mutate([inv.id])} aria-label="Restore"><ArchiveRestore size={16} /></button></Tooltip>
                      ))}
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="inv-detail-row">
                      <td></td>
                      <td></td>
                      <td colSpan={liquidatedTab ? 9 : 8}>
                        <div className="inv-detail">
                          <div className="inv-detail-history">
                            <h3>Balance history</h3>
                            {inv.snapshots.length === 0 ? (
                              <p className="inv-detail-empty">No snapshots yet. Use “Add snapshot date”.</p>
                            ) : (
                              <table className="inv-history-table">
                                <thead><tr><th>Date</th><th className="amount-col col-center">Value</th>{canWrite && <th></th>}</tr></thead>
                                <tbody>
                                  {inv.snapshots.map((s) => {
                                    const isEd = editSnap?.invId === inv.id && editSnap?.snapId === s.id
                                    return (
                                      <tr key={s.id}>
                                        <td>{s.as_of.slice(0, 10)}</td>
                                        <td className="amount-col col-center">
                                          {isEd ? (
                                            <input type="number" step="0.01" min="0" value={editSnapVal} autoFocus
                                              onChange={(e) => setEditSnapVal(e.target.value)}
                                              onKeyDown={(e) => { if (e.key === 'Enter') saveSnapEdit(inv, s) }} />
                                          ) : money(parseFloat(s.value))}
                                        </td>
                                        {canWrite && (
                                          <td>
                                            {isEd ? (
                                              <>
                                                <button className="icon-btn icon-btn--save" onClick={() => saveSnapEdit(inv, s)} aria-label="Save"><Check size={15} /></button>
                                                <button className="icon-btn icon-btn--cancel" onClick={() => setEditSnap(null)} aria-label="Cancel"><X size={15} /></button>
                                              </>
                                            ) : (
                                              <>
                                                <button className="icon-btn icon-btn--edit" onClick={() => { setEditSnap({ invId: inv.id, snapId: s.id }); setEditSnapVal(parseFloat(s.value).toString()) }} aria-label="Edit value"><Pencil size={15} /></button>
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
                          {inv.strategy && (
                            <div className="inv-detail-strategy">
                              <h3>Strategy</h3>
                              <p>{inv.strategy}</p>
                            </div>
                          )}
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
                  ? (liquidatedTab ? 'No liquidated investments.' : 'No investments yet.')
                  : 'No investments match your search.'}
              </td></tr>
            )}
          </tbody>
          {displayedRows.length > 0 && (
            <tfoot>
              <tr className="budget-total-row">
                <td></td><td></td><td>Total</td><td></td><td></td><td></td><td></td>
                <td className="amount-col col-center">{money(grandTotal)}</td>
                <td></td>
                {liquidatedTab && <td></td>}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

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
                  <span>{r.brokerage}{r.owner ? ` · ${r.owner}` : ''}</span>
                  <input type="number" step="0.01" min="0"
                    placeholder={existing ? parseFloat(existing.value).toFixed(2) : '—'}
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
