'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pencil, Trash2, Check, X, CircleDollarSign } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@/components/Spinner'


interface Account {
  id: string
  name: string
  institution: string | null
  type: string
}

interface Transaction {
  id: string
  account_id: string | null
  account_name: string | null
  plaid_transaction_id: string | null
  is_manual: boolean
  amount: string
  type: string
  category: string | null
  description: string | null
  check_number: string | null
  date: string
  is_posted: boolean
  budget_flagged: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

interface EditState {
  id: string
  account_id: string | null
  amount: string
  type: 'income' | 'expense'
  category: string
  description: string
  check_number: string
  date: string
  is_posted: boolean
  budget_flagged: boolean
  notes: string
}

interface NewRow {
  account_id: string
  amount: string
  type: 'income' | 'expense'
  category: string
  description: string
  check_number: string
  date: string
  is_posted: boolean
  budget_flagged: boolean
  notes: string
}

type Period = 'all' | '3m' | '6m' | string // string covers 'YYYY' and 'YYYY-MM'

function buildPeriodLabel(period: Period): string {
  if (period === 'all') return 'All Time'
  if (period === '3m') return 'Last 3 Months'
  if (period === '6m') return 'Last 6 Months'
  if (/^\d{4}$/.test(period)) return period
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1)
    return date.toLocaleString('default', { month: 'long', year: 'numeric' })
  }
  return period
}

function currentMonthPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function adjacentMonth(period: string, direction: -1 | 1): string {
  const [year, month] = period.split('-').map(Number)
  const date = new Date(year, month - 1 + direction)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

async function fetchTransactions(period: Period, accountId: string): Promise<Transaction[]> {
  const params = new URLSearchParams()
  if (period !== 'all') params.set('period', period)
  if (accountId !== 'all') params.set('account_id', accountId)
  const res = await fetch(`/api/transactions?${params}`)
  if (!res.ok) throw new Error('Failed to fetch transactions')
  return res.json()
}

export function MonthlyLedger({ accounts }: { accounts: Account[] }) {
  const qc = useQueryClient()
  const [period, setPeriod] = useState<Period>(currentMonthPeriod())
  const [selectedAccount, setSelectedAccount] = useState<string>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [showNewRow, setShowNewRow] = useState(false)
  const [newRow, setNewRow] = useState<NewRow>({
    account_id: accounts[0]?.id ?? '',
    amount: '',
    type: 'expense',
    category: '',
    description: '',
    check_number: '',
    date: new Date().toISOString().slice(0, 10),
    is_posted: true,
    budget_flagged: false,
    notes: '',
  })
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [syncing, setSyncing] = useState(false)

  // Build available years from accounts (simplified: use current year ± 5)
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 8 }, (_, i) => String(currentYear - 7 + i))

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories')
      if (!res.ok) throw new Error('Failed to fetch categories')
      return res.json()
    },
  })

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', period, selectedAccount],
    queryFn: () => fetchTransactions(period, selectedAccount),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EditState> }) => {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update transaction')
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      setEditingId(null)
      setEditState(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete transaction')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })

  const createMutation = useMutation({
    mutationFn: async (data: NewRow) => {
      const amount = parseFloat(data.amount)
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          amount: data.type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
          account_id: data.account_id || null,
        }),
      })
      if (!res.ok) throw new Error('Failed to create transaction')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      setShowNewRow(false)
    },
  })

  const startEdit = useCallback((tx: Transaction) => {
    setEditingId(tx.id)
    setEditState({
      id: tx.id,
      account_id: tx.account_id,
      amount: Math.abs(parseFloat(tx.amount)).toString(),
      type: tx.type as 'income' | 'expense',
      category: tx.category ?? '',
      description: tx.description ?? '',
      check_number: tx.check_number ?? '',
      date: tx.date.slice(0, 10),
      is_posted: tx.is_posted,
      budget_flagged: tx.budget_flagged,
      notes: tx.notes ?? '',
    })
  }, [])

  const saveEdit = useCallback(() => {
    if (!editState) return
    const amount = parseFloat(editState.amount)
    updateMutation.mutate({
      id: editState.id,
      data: {
        ...editState,
        amount: editState.type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
      } as unknown as Partial<EditState>,
    })
  }, [editState, updateMutation])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditState(null)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelEdit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelEdit])

  // Compute running balance (descending order → compute from top)
  const filteredTransactions = selectedCategory === 'all'
    ? transactions
    : transactions.filter((tx) => tx.category === selectedCategory)

  const sortedTx = [...filteredTransactions].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date)
    return b.created_at.localeCompare(a.created_at)
  })
  let runningBalance = 0
  const balances: Record<string, number> = {}
  const reversed = [...sortedTx].reverse()
  for (const tx of reversed) {
    runningBalance += parseFloat(tx.amount)
    balances[tx.id] = runningBalance
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/plaid/sync', { method: 'POST', body: JSON.stringify({}) })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    } finally {
      setSyncing(false)
    }
  }

  const isMonthPeriod = /^\d{4}-\d{2}$/.test(period)

  return (
    <div className="monthly-ledger">
      <div className="ledger-header">
        <h1>Monthly Budget</h1>

        <div className="ledger-controls">
          {/* Period selector */}
          <div className="period-selector">
            <select
              value={/^\d{4}-\d{2}$/.test(period) ? 'month' : period}
              onChange={(e) => {
                const val = e.target.value
                if (val === 'month') {
                  setPeriod(currentMonthPeriod())
                } else {
                  setPeriod(val)
                }
              }}
            >
              <option value="all">All Time</option>
              <option value="6m">Last 6 Months</option>
              <option value="3m">Last 3 Months</option>
              <option value="month">By Month</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            {isMonthPeriod && (
              <div className="month-nav">
                <button onClick={() => setPeriod(adjacentMonth(period, -1))}>‹</button>
                <span>{buildPeriodLabel(period)}</span>
                <button onClick={() => setPeriod(adjacentMonth(period, 1))}>›</button>
              </div>
            )}
          </div>

          {/* Account filter */}
          <div className="account-tabs">
            <button
              className={selectedAccount === 'all' ? 'active' : ''}
              onClick={() => setSelectedAccount('all')}
            >
              All
            </button>
            {accounts.map((acct) => (
              <button
                key={acct.id}
                className={selectedAccount === acct.id ? 'active' : ''}
                onClick={() => setSelectedAccount(acct.id)}
              >
                {acct.name}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="category-filter"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="ledger-actions">
            <button onClick={() => setShowNewRow(true)} disabled={showNewRow}>
              + Transaction
            </button>
            <button onClick={handleSync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync Accounts'}
            </button>
          </div>
        </div>
      </div>

      {isLoading && <Spinner />}

      <datalist id="categories-list">
        {categories.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              {selectedAccount === 'all' && <th>Source</th>}
              <th>Date</th>
              <th className="col-center">Posted</th>
              <th className="col-center">Check #</th>
              <th>Category</th>
              <th>Description</th>
              <th className="amount-col col-center">Amount</th>
              <th className="amount-col col-center">Balance</th>
              <th className="col-center">Budget</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {showNewRow && (
              <tr className="new-row">
                {selectedAccount === 'all' && (
                  <td>
                    <select
                      value={newRow.account_id}
                      onChange={(e) => setNewRow({ ...newRow, account_id: e.target.value })}
                    >
                      <option value="">Manual (no account)</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </td>
                )}
                <td>
                  <input
                    type="date"
                    value={newRow.date}
                    onChange={(e) => setNewRow({ ...newRow, date: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={newRow.is_posted}
                    onChange={(e) => setNewRow({ ...newRow, is_posted: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    value={newRow.check_number}
                    onChange={(e) => setNewRow({ ...newRow, check_number: e.target.value })}
                    placeholder="Check #"
                  />
                </td>
                <td>
                  <input
                    list="categories-list"
                    value={newRow.category}
                    onChange={(e) => setNewRow({ ...newRow, category: e.target.value.toUpperCase() })}
                    placeholder="Category"
                  />
                </td>
                <td>
                  <input
                    value={newRow.description}
                    onChange={(e) => setNewRow({ ...newRow, description: e.target.value })}
                    placeholder="Description"
                  />
                </td>
                <td>
                  <select
                    value={newRow.type}
                    onChange={(e) => setNewRow({ ...newRow, type: e.target.value as 'income' | 'expense' })}
                  >
                    <option value="income">+ Credit</option>
                    <option value="expense">− Debit</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newRow.amount}
                    onChange={(e) => setNewRow({ ...newRow, amount: e.target.value })}
                    placeholder="0.00"
                  />
                </td>
                <td>—</td>
                <td>
                  <input
                    type="checkbox"
                    checked={newRow.budget_flagged}
                    onChange={(e) => setNewRow({ ...newRow, budget_flagged: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    value={newRow.notes}
                    onChange={(e) => setNewRow({ ...newRow, notes: e.target.value })}
                    placeholder="Notes"
                  />
                </td>
                <td>
                  <button onClick={() => createMutation.mutate(newRow)} aria-label="Save"><Check size={14} /></button>
                  <button onClick={() => setShowNewRow(false)} aria-label="Cancel"><X size={14} /></button>
                </td>
              </tr>
            )}

            {sortedTx.map((tx) => {
              const amount = parseFloat(tx.amount)
              const isCredit = amount >= 0
              const isEditing = editingId === tx.id

              if (isEditing && editState) {
                return (
                  <tr key={tx.id} className="editing-row">
                    {selectedAccount === 'all' && <td>{tx.account_name ?? (tx.is_manual ? 'Manual' : '—')}</td>}
                    <td>
                      <input
                        type="date"
                        value={editState.date}
                        onChange={(e) => setEditState({ ...editState, date: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={editState.is_posted}
                        onChange={(e) => setEditState({ ...editState, is_posted: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        value={editState.check_number}
                        onChange={(e) => setEditState({ ...editState, check_number: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        list="categories-list"
                        value={editState.category}
                        onChange={(e) => setEditState({ ...editState, category: e.target.value.toUpperCase() })}
                        placeholder="Category"
                      />
                    </td>
                    <td>
                      <input
                        value={editState.description}
                        onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={editState.type}
                        onChange={(e) => setEditState({ ...editState, type: e.target.value as 'income' | 'expense' })}
                      >
                        <option value="income">+ Credit</option>
                        <option value="expense">− Debit</option>
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editState.amount}
                        onChange={(e) => setEditState({ ...editState, amount: e.target.value })}
                      />
                    </td>
                    <td className={balances[tx.id] >= 0 ? 'positive' : 'negative'}>
                      {balances[tx.id].toFixed(2)}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={editState.budget_flagged}
                        onChange={(e) => setEditState({ ...editState, budget_flagged: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        value={editState.notes}
                        onChange={(e) => setEditState({ ...editState, notes: e.target.value })}
                      />
                    </td>
                    <td>
                      <button onClick={saveEdit} aria-label="Save"><Check size={14} /></button>
                      <button onClick={cancelEdit} aria-label="Cancel"><X size={14} /></button>
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={tx.id} className={isCredit ? 'credit-row' : 'debit-row'}>
                  {selectedAccount === 'all' && <td>{tx.account_name ?? (tx.is_manual ? 'Manual' : '—')}</td>}
                  <td>{tx.date.slice(0, 10)}</td>
                  <td className="col-center">{tx.is_posted ? <Check size={14} /> : ''}</td>
                  <td className="col-center">{tx.check_number ?? ''}</td>
                  <td>{tx.category ?? ''}</td>
                  <td>{tx.description ?? ''}</td>
                  <td className={`col-center ${isCredit ? 'positive' : 'negative'}`}>
                    {isCredit ? '+' : '−'}{Math.abs(amount).toFixed(2)}
                  </td>
                  <td className={`col-center ${balances[tx.id] >= 0 ? 'positive' : 'negative'}`}>
                    {balances[tx.id].toFixed(2)}
                  </td>
                  <td className="col-center">
                    {tx.budget_flagged ? (
                      <span title="Transaction included in monthly budget. Subtracted from balance after all monthly bills are paid">
                        <CircleDollarSign size={14} />
                      </span>
                    ) : ''}
                  </td>
                  <td>{tx.notes ?? ''}</td>
                  <td>
                    <button onClick={() => startEdit(tx)} aria-label="Edit"><Pencil size={14} /></button>
                    {tx.is_manual && (
                      <button onClick={() => deleteMutation.mutate(tx.id)} aria-label="Delete"><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              )
            })}

            {!isLoading && sortedTx.length === 0 && (
              <tr>
                <td colSpan={selectedAccount === 'all' ? 11 : 10} style={{ textAlign: 'center', padding: '2rem' }}>
                  No transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
