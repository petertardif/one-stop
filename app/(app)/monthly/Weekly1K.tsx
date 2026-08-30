'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, CalendarDays } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@/components/Spinner'
import { RecordModal, ModalField } from '@/components/RecordModal'
import { ColumnFilter } from '@/components/ColumnFilter'
import { BudgetAccountIcon, budgetAccountLabel, type BudgetAccount } from '@/components/BudgetAccount'
import { CheckboxesTotalCard, useRowSelection } from '@/components/CheckboxesTotal'
import { money } from '@/lib/format'
import { formatWeekRange, userTz, weekStartOf } from './weeks'

// A transaction counting against the week's allowance. Same shape as the ledger's rows,
// minus the columns this view doesn't show.
interface WeeklyTransaction {
  id: string
  is_manual: boolean
  amount: string
  type: string
  category: string | null
  description: string | null
  date: string
  is_posted: boolean
  budget_account: BudgetAccount | null
  seq: string | null
  notes: string | null
  weekly_balance: string | null
}

// A top-up raising this week's allowance above $1,000.
interface Adjustment {
  id: string
  week_start: string
  amount: string
  created_at: string
}

interface WeeklyResponse {
  week_start: string
  allowance: number
  remaining: string
  spent: string
  transactions: WeeklyTransaction[]
  adjustments: Adjustment[]
}

// The table mixes two record types. Transactions carry the running balance; a top-up has
// no position in that running order (it applies flat from the week's start), so it shows
// the week's opening allowance instead.
type Row =
  | { kind: 'tx'; id: string; amount: number; tx: WeeklyTransaction }
  | { kind: 'topup'; id: string; amount: number; adj: Adjustment }

const COL_COUNT = 9

export function Weekly1K({ role }: { role: string }) {
  const qc = useQueryClient()
  const canWrite = role === 'admin'
  const [week, setWeek] = useState<string>(() => weekStartOf(new Date()))
  const selection = useRowSelection()

  // Edit-top-up modal
  const editDialogRef = useRef<HTMLDialogElement>(null)
  const headerCheckboxRef = useRef<HTMLInputElement>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editWeek, setEditWeek] = useState('')

  const { data: weekList } = useQuery<{ weeks: string[]; current: string }>({
    queryKey: ['weekly-weeks'],
    queryFn: async () => {
      const res = await fetch(`/api/weekly/weeks?tz=${encodeURIComponent(userTz())}`)
      if (!res.ok) throw new Error('Failed to fetch weeks')
      return res.json()
    },
  })

  const { data, isLoading } = useQuery<WeeklyResponse>({
    queryKey: ['weekly', week],
    queryFn: async () => {
      const params = new URLSearchParams({ week_start: week, tz: userTz() })
      const res = await fetch(`/api/weekly?${params}`)
      if (!res.ok) throw new Error('Failed to fetch weekly budget')
      return res.json()
    },
  })

  const updateTopUp = useMutation({
    mutationFn: async ({ id, week_start, amount }: { id: string; week_start: string; amount: number }) => {
      const res = await fetch(`/api/transactions/weekly-budget/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start, amount }),
      })
      if (!res.ok) throw new Error('Failed to update top-up')
    },
    onSuccess: () => {
      // 'weekly-budget' feeds the Ledger tab's two cards; 'weekly-weeks' because moving a
      // top-up can bring a previously-empty week into the picker.
      qc.invalidateQueries({ queryKey: ['weekly'] })
      qc.invalidateQueries({ queryKey: ['weekly-budget'] })
      qc.invalidateQueries({ queryKey: ['weekly-weeks'] })
      editDialogRef.current?.close()
    },
  })

  const transactions = data?.transactions ?? []
  const adjustments = data?.adjustments ?? []
  const allowance = data?.allowance ?? 0

  // Transactions newest-first (matching the ledger), then the top-ups, which belong at
  // the start of the week — the bottom of a newest-first list.
  const rows: Row[] = [
    ...transactions.map((tx): Row => ({ kind: 'tx', id: tx.id, amount: parseFloat(tx.amount), tx })),
    ...adjustments.map((adj): Row => ({ kind: 'topup', id: adj.id, amount: parseFloat(adj.amount), adj })),
  ]

  const selectableRow = (r: Row) => ({ id: r.id, amount: r.amount, meta: undefined })

  // Cached selection amounts go stale when a top-up is edited — re-sync on new data.
  const syncSelection = selection.sync
  useEffect(() => {
    syncSelection(rows.map(selectableRow))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, syncSelection])

  // Header check-all, matching the ledger: it speaks for the rows on screen (this
  // week's), so it adds/removes only those — selections on other weeks are left alone.
  // The card's Clear is still the global reset.
  const allSelected = rows.length > 0 && rows.every((r) => selection.has(r.id))
  const someSelected = rows.some((r) => selection.has(r.id))

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected && !allSelected
    }
  }, [someSelected, allSelected])

  const toggleSelectAll = (checked: boolean) =>
    selection.setMany(rows.map(selectableRow), checked)

  const weekOptions = (weekList?.weeks ?? [week]).map((w) => ({
    value: w,
    label: `${formatWeekRange(w)}${w === weekList?.current ? ' (this week)' : ''}`,
  }))

  const openEdit = (adj: Adjustment) => {
    setEditId(adj.id)
    setEditAmount(Math.abs(parseFloat(adj.amount)).toFixed(2))
    setEditWeek(adj.week_start)
    editDialogRef.current?.showModal()
  }

  const saveEdit = () => {
    if (!editId) return
    updateTopUp.mutate({ id: editId, week_start: editWeek, amount: parseFloat(editAmount) })
  }

  const canSaveEdit = parseFloat(editAmount) > 0 && editWeek !== ''

  return (
    <>
      <div className="ledger-header">
        <div className="weekly-cards">
          <div className="weekly-budget-card weekly-budget-card--total">
            <div className="weekly-budget-card__info">
              <span className="weekly-budget-card__label">1k Budget Spent</span>
              <span className="weekly-budget-card__range">{formatWeekRange(week)}</span>
            </div>
            <div className="weekly-budget-card__amount">
              {money(data ? parseFloat(data.spent) : 0)}
              <span className="weekly-budget-card__amount-label">spent</span>
            </div>
          </div>

          <CheckboxesTotalCard selection={selection} />
        </div>

        <div className="ledger-controls">
          <ColumnFilter
            label={formatWeekRange(week)}
            mode="single"
            options={weekOptions}
            selected={[week]}
            onChange={(next) => setWeek(next[0] ?? week)}
            icon={<CalendarDays size={14} />}
            triggerClassName="filter-chip"
          />
        </div>
      </div>

      {isLoading && <Spinner />}

      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th className="col-center">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                  aria-label="Select all"
                />
              </th>
              <th>Date</th>
              <th className="col-center">Posted</th>
              <th>Category</th>
              <th className="desc-col">Description</th>
              <th className="amount-col col-center">Amount</th>
              <th className="col-center">Budget</th>
              <th className="amount-col col-center">1K Weekly<br />Balance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isCredit = row.amount >= 0
              return (
                <tr key={row.id} className={isCredit ? 'credit-row' : 'debit-row'}>
                  <td className="col-center">
                    <input
                      type="checkbox"
                      checked={selection.has(row.id)}
                      onChange={() => selection.toggle(selectableRow(row))}
                    />
                  </td>
                  <td>{row.kind === 'tx' ? row.tx.date.slice(0, 10) : row.adj.week_start}</td>
                  <td className="col-center">
                    {row.kind === 'tx' && row.tx.is_posted ? <Check size={14} /> : ''}
                  </td>
                  <td>{row.kind === 'tx' ? row.tx.category ?? '' : ''}</td>
                  <td className="desc-col">
                    {row.kind === 'tx' ? row.tx.description ?? '' : '1K allowance top-up'}
                  </td>
                  <td className={`col-center ${isCredit ? 'positive' : 'negative'}`}>
                    {isCredit ? '+' : '−'}{Math.abs(row.amount).toFixed(2)}
                  </td>
                  <td className="col-center">
                    {row.kind === 'tx' && row.tx.budget_account && (
                      <BudgetAccountIcon
                        account={row.tx.budget_account}
                        tooltip={`${budgetAccountLabel(row.tx.budget_account)} — counts toward the weekly budget`}
                      />
                    )}
                  </td>
                  <td className="col-center">
                    {row.kind === 'tx'
                      ? row.tx.weekly_balance != null ? parseFloat(row.tx.weekly_balance).toFixed(2) : '—'
                      : allowance.toFixed(2)}
                  </td>
                  <td>
                    {/* Transactions are read-only here — they belong to the ledger. Only
                        the top-ups, which exist solely as weekly-budget records, are
                        editable from this tab. */}
                    {row.kind === 'topup' && canWrite && (
                      <button className="icon-btn icon-btn--edit" onClick={() => openEdit(row.adj)} aria-label="Edit top-up">
                        <Pencil size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}

            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} className="col-center">
                  Nothing counted against this week&apos;s $1,000 yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RecordModal
        dialogRef={editDialogRef}
        title="Edit 1K top-up"
        onSave={saveEdit}
        saving={updateTopUp.isPending}
        canSave={canSaveEdit}
      >
        <ModalField label="Amount">
          <input
            type="number" step="0.01" autoFocus placeholder="0.00"
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
          />
        </ModalField>
        <ModalField label="Week" full>
          <select value={editWeek} onChange={(e) => setEditWeek(e.target.value)}>
            {weekOptions.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
          <span className="record-field__hint">
            Moving a top-up to another week removes it from the week shown here.
          </span>
        </ModalField>
      </RecordModal>
    </>
  )
}
