'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Pencil, Check, X, Copy, Trash2, ChevronUp, ChevronDown, Search, Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@/components/Spinner'
import { RecordModal, ModalField } from '@/components/RecordModal'
import { MultiSelect } from '@/components/MultiSelect'
import { Tooltip } from '@/components/Tooltip'

type SortKey =
  | 'date' | 'organization' | 'donor_name' | 'donor_contact'
  | 'amount' | 'payment_method' | 'goods_services_value'

type PaymentMethod = 'cash' | 'non_cash'
const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash: 'Cash', non_cash: 'Non-cash' }

interface Donation {
  id: string
  date: string
  organization: string | null
  donor_name: string | null
  donor_contact: string | null
  amount: string
  payment_method: PaymentMethod
  goods_services_value: string | null
  notes: string | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

interface DonationsResponse {
  rows: Donation[]
}

interface FormState {
  date: string
  organization: string
  donorName: string
  donorContact: string
  amount: string
  paymentMethod: PaymentMethod
  goodsValue: string
  notes: string
}

const emptyForm = (): FormState => ({
  date: '', organization: '', donorName: '', donorContact: '',
  amount: '', paymentMethod: 'cash', goodsValue: '', notes: '',
})
const money = (v: string | null) => (v != null && v !== '' ? `$${parseFloat(v).toFixed(2)}` : '')

export function DonationsTable({ role }: { role: string }) {
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
  const [yearFilter, setYearFilter] = useState<string[]>([])

  const { data, isLoading } = useQuery<DonationsResponse>({
    queryKey: ['donations'],
    queryFn: async () => {
      const res = await fetch('/api/charitable-donations')
      if (!res.ok) throw new Error('Failed to fetch donations')
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

  const invalidate = () => qc.invalidateQueries({ queryKey: ['donations'] })

  const bodyOf = (f: FormState) => ({
    date: f.date,
    organization: f.organization || null,
    donor_name: f.donorName || null,
    donor_contact: f.donorContact || null,
    amount: f.amount.trim() === '' ? 0 : parseFloat(f.amount),
    payment_method: f.paymentMethod,
    goods_services_value: f.goodsValue.trim() === '' ? null : parseFloat(f.goodsValue),
    notes: f.notes || null,
  })

  const createMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const res = await fetch('/api/charitable-donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyOf(f)),
      })
      if (!res.ok) throw new Error('Failed to create donation')
    },
    onSuccess: () => { invalidate(); newDialogRef.current?.close(); setNewRow(emptyForm()) },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: FormState }) => {
      const res = await fetch(`/api/charitable-donations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyOf(f)),
      })
      if (!res.ok) throw new Error('Failed to update donation')
    },
    onSuccess: () => { invalidate(); setEditingId(null) },
  })

  const duplicateMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/charitable-donations/bulk-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Failed to duplicate donations')
    },
    onSuccess: () => { invalidate(); setSelectedIds(new Set()) },
  })

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) => fetch(`/api/charitable-donations/${id}`, { method: 'DELETE' }).then((r) => {
          if (!r.ok) throw new Error('Failed to delete donation')
        }))
      )
    },
    onSuccess: () => { invalidate(); setSelectedIds(new Set()) },
  })

  const rows = data?.rows ?? []

  const yearOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.date.slice(0, 4)))).sort().reverse(),
    [rows]
  )

  // Search + year filter + optional column sort. Manual order kept when unsorted.
  const displayedRows = useMemo(() => {
    let list = rows
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (r) =>
          (r.organization ?? '').toLowerCase().includes(q) ||
          (r.donor_name ?? '').toLowerCase().includes(q) ||
          (r.donor_contact ?? '').toLowerCase().includes(q) ||
          (r.notes ?? '').toLowerCase().includes(q)
      )
    }
    if (yearFilter.length > 0) list = list.filter((r) => yearFilter.includes(r.date.slice(0, 4)))
    if (sortKey) {
      const val = (r: Donation): string | number => {
        switch (sortKey) {
          case 'date': return r.date
          case 'organization': return (r.organization ?? '').toLowerCase()
          case 'donor_name': return (r.donor_name ?? '').toLowerCase()
          case 'donor_contact': return (r.donor_contact ?? '').toLowerCase()
          case 'amount': return parseFloat(r.amount)
          case 'payment_method': return r.payment_method
          case 'goods_services_value': return r.goods_services_value ? parseFloat(r.goods_services_value) : 0
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
  }, [rows, search, yearFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortKey(null); setSortDir('asc') }
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const totalAmount = displayedRows.reduce((s, r) => s + parseFloat(r.amount), 0)
  const totalGoods = displayedRows.reduce((s, r) => s + (r.goods_services_value ? parseFloat(r.goods_services_value) : 0), 0)

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

  const startEdit = (d: Donation) => {
    setEditingId(d.id)
    setForm({
      date: d.date.slice(0, 10),
      organization: d.organization ?? '',
      donorName: d.donor_name ?? '',
      donorContact: d.donor_contact ?? '',
      amount: parseFloat(d.amount).toString(),
      paymentMethod: d.payment_method,
      goodsValue: d.goods_services_value != null ? parseFloat(d.goods_services_value).toString() : '',
      notes: d.notes ?? '',
    })
  }

  // Shared editable cells for the new + editing rows.
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
        <input value={state.organization} onChange={(e) => set({ ...state, organization: e.target.value })} placeholder="Organization" />
      </td>
      <td>
        <input value={state.donorName} onChange={(e) => set({ ...state, donorName: e.target.value })} placeholder="Donor name" />
      </td>
      <td>
        <input value={state.donorContact} onChange={(e) => set({ ...state, donorContact: e.target.value })} placeholder="Contact info" />
      </td>
      <td className="amount-col col-center">
        <input type="number" step="0.01" min="0" value={state.amount} onChange={(e) => set({ ...state, amount: e.target.value })} placeholder="Amount" />
      </td>
      <td>
        <select value={state.paymentMethod} onChange={(e) => set({ ...state, paymentMethod: e.target.value as PaymentMethod })}>
          <option value="cash">Cash</option>
          <option value="non_cash">Non-cash</option>
        </select>
      </td>
      <td className="amount-col col-center">
        <input type="number" step="0.01" min="0" value={state.goodsValue} onChange={(e) => set({ ...state, goodsValue: e.target.value })} placeholder="Value" />
      </td>
      <td>
        <input value={state.notes} onChange={(e) => set({ ...state, notes: e.target.value })} placeholder="Notes" />
      </td>
    </>
  )

  return (
    <div className="monthly-ledger">
      <div className="ledger-header">
        <h1>Charitable Donations</h1>

        <div className="ledger-controls">
          <MultiSelect label="Years" options={yearOptions} selected={yearFilter} onChange={setYearFilter} />

          <div className="ledger-search">
            <Search size={14} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search donations…"
              aria-label="Search donations"
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
              {sortableTh('organization', 'Organization')}
              {sortableTh('donor_name', 'Donor Name')}
              {sortableTh('donor_contact', 'Donor Contact Info')}
              {sortableTh('amount', 'Donation Amount', 'amount-col col-center')}
              {sortableTh('payment_method', 'Payment Method')}
              {sortableTh('goods_services_value', 'Value of goods/services', 'amount-col col-center')}
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((d) => {
              if (editingId === d.id) {
                return (
                  <tr key={d.id} className="editing-row">
                    <td></td>
                    {formCells(form, setForm)}
                    <td>
                      <button className="icon-btn icon-btn--save" onClick={() => updateMutation.mutate({ id: d.id, f: form })} aria-label="Save"><Check size={16} /></button>
                      <button className="icon-btn icon-btn--cancel" onClick={() => setEditingId(null)} aria-label="Cancel"><X size={16} /></button>
                    </td>
                  </tr>
                )
              }
              return (
                <tr key={d.id}>
                  <td className="col-center">
                    {canWrite && <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleSelect(d.id)} />}
                  </td>
                  <td>{d.date.slice(0, 10)}</td>
                  <td>{d.organization ?? ''}</td>
                  <td>{d.donor_name ?? ''}</td>
                  <td>{d.donor_contact ?? ''}</td>
                  <td className="amount-col col-center">{money(d.amount)}</td>
                  <td>{PAYMENT_LABEL[d.payment_method]}</td>
                  <td className="amount-col col-center">{money(d.goods_services_value)}</td>
                  <td>{d.notes ?? ''}</td>
                  <td>
                    {canWrite && (
                      <>
                        <button className="icon-btn icon-btn--edit" onClick={() => startEdit(d)} aria-label="Edit"><Pencil size={16} /></button>
                        <Tooltip text="Duplicate"><button className="icon-btn icon-btn--edit" onClick={() => duplicateMutation.mutate([d.id])} aria-label="Duplicate"><Copy size={16} /></button></Tooltip>
                        <Tooltip text="Delete"><button className="icon-btn icon-btn--delete" onClick={() => deleteMutation.mutate([d.id])} aria-label="Delete"><Trash2 size={16} /></button></Tooltip>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}

            {!isLoading && displayedRows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>
                  {rows.length === 0 ? 'No donations recorded.' : 'No donations match your filters.'}
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
                <td></td>
                <td className="amount-col col-center">${totalAmount.toFixed(2)}</td>
                <td></td>
                <td className="amount-col col-center">${totalGoods.toFixed(2)}</td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <RecordModal
        dialogRef={newDialogRef}
        title="New donation"
        onSave={() => createMutation.mutate(newRow)}
        saving={createMutation.isPending}
        canSave={newRow.organization.trim() !== '' && newRow.date !== ''}
      >
        <ModalField label="Date">
          <input type="date" value={newRow.date} onChange={(e) => setNewRow({ ...newRow, date: e.target.value })} />
        </ModalField>
        <ModalField label="Organization">
          <input value={newRow.organization} autoFocus placeholder="Organization"
            onChange={(e) => setNewRow({ ...newRow, organization: e.target.value })} />
        </ModalField>
        <ModalField label="Donor name">
          <input value={newRow.donorName} placeholder="Donor name"
            onChange={(e) => setNewRow({ ...newRow, donorName: e.target.value })} />
        </ModalField>
        <ModalField label="Donor contact info">
          <input value={newRow.donorContact} placeholder="Contact info"
            onChange={(e) => setNewRow({ ...newRow, donorContact: e.target.value })} />
        </ModalField>
        <ModalField label="Donation amount">
          <input type="number" step="0.01" min="0" value={newRow.amount} placeholder="0.00"
            onChange={(e) => setNewRow({ ...newRow, amount: e.target.value })} />
        </ModalField>
        <ModalField label="Payment method">
          <select value={newRow.paymentMethod}
            onChange={(e) => setNewRow({ ...newRow, paymentMethod: e.target.value as PaymentMethod })}>
            <option value="cash">Cash</option>
            <option value="non_cash">Non-cash</option>
          </select>
        </ModalField>
        <ModalField label="Value of goods/services">
          <input type="number" step="0.01" min="0" value={newRow.goodsValue} placeholder="0.00"
            onChange={(e) => setNewRow({ ...newRow, goodsValue: e.target.value })} />
        </ModalField>
        <ModalField label="Notes" full>
          <input value={newRow.notes} placeholder="Notes"
            onChange={(e) => setNewRow({ ...newRow, notes: e.target.value })} />
        </ModalField>
      </RecordModal>
    </div>
  )
}
