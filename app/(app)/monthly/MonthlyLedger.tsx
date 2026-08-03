'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, Fragment } from 'react'
import { Pencil, Trash2, Check, X, Landmark, CreditCard, StickyNote, Banknote, SlidersHorizontal, Plus, Copy, RefreshCw, Wallet, CalendarDays, CheckCheck, ChevronDown } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@/components/Spinner'
import { RecordModal, ModalField } from '@/components/RecordModal'
import { Tooltip } from '@/components/Tooltip'
import { ColumnFilter } from '@/components/ColumnFilter'


interface Account {
  id: string
  name: string
  institution: string | null
  type: string
}

// A transaction's budget account. null = N/A (not in the weekly budget; no icon,
// excluded from the card totals). The Budget column is a dropdown of these.
type BudgetAccount = 'bank' | 'chase_cc' | 'boa_cc'

const BUDGET_ACCOUNTS: { value: BudgetAccount; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'chase_cc', label: 'Chase CC' },
  { value: 'boa_cc', label: 'BoA CC' },
]

// Read-view icon per account: Bank → landmark (neutral); Chase CC → credit card
// in Chase blue; BoA CC → credit card in Bank of America red (colors via CSS).
const BUDGET_ICON: Record<BudgetAccount, { Icon: typeof Landmark; cls: string; label: string }> = {
  bank: { Icon: Landmark, cls: 'budget-icon--bank', label: 'Bank' },
  chase_cc: { Icon: CreditCard, cls: 'budget-icon--chase', label: 'Chase CC' },
  boa_cc: { Icon: CreditCard, cls: 'budget-icon--boa', label: 'BoA CC' },
}

// "Mark as…" bulk-update options. Each item sets one field on the selected manual
// rows. `divider` renders a separator after the item (Posted/Unposted vs Budget).
type MarkField = 'is_posted' | 'budget_account'
type MarkValue = boolean | BudgetAccount | null
const MARK_OPTIONS: { label: string; field: MarkField; value: MarkValue; divider?: boolean }[] = [
  { label: 'Posted', field: 'is_posted', value: true },
  { label: 'Unposted', field: 'is_posted', value: false, divider: true },
  { label: 'Budget-N/A', field: 'budget_account', value: null },
  { label: 'Budget-Bank', field: 'budget_account', value: 'bank' },
  { label: 'Budget-Chase CC', field: 'budget_account', value: 'chase_cc' },
  { label: 'Budget-BoA CC', field: 'budget_account', value: 'boa_cc' },
]

// Toolbar "Mark as…" dropdown. Closes on pick, outside-click, or Escape.
function MarkAsMenu({ disabled, onPick }: { disabled: boolean; onPick: (field: MarkField, value: MarkValue) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="mark-menu" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} disabled={disabled} aria-haspopup="menu" aria-expanded={open}>
        <CheckCheck size={14} /> Mark as… <ChevronDown size={14} />
      </button>
      {open && (
        <div className="mark-menu__list" role="menu">
          {MARK_OPTIONS.map((o) => (
            <Fragment key={o.label}>
              <button role="menuitem" onClick={() => { setOpen(false); onPick(o.field, o.value) }}>{o.label}</button>
              {o.divider && <div className="mark-menu__divider" />}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

// Toolbar "+ Add" dropdown (filled primary): New Transaction opens the add-tx
// modal; Amount to 1k Weekly opens the weekly top-up modal. Closes on pick,
// outside-click, or Escape.
function AddMenu({ onNewTransaction, onAddWeekly }: { onNewTransaction: () => void; onAddWeekly: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="mark-menu" ref={ref}>
      <button className="primary" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Plus size={14} /> Add <ChevronDown size={14} />
      </button>
      {open && (
        <div className="mark-menu__list mark-menu__list--right" role="menu">
          <button role="menuitem" onClick={() => { setOpen(false); onNewTransaction() }}><Plus size={14} /> New Transaction</button>
          <button role="menuitem" onClick={() => { setOpen(false); onAddWeekly() }}><Wallet size={14} /> Amount to 1k Weekly</button>
        </div>
      )}
    </div>
  )
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
  budget_account: BudgetAccount | null
  balance: string | null
  seq: string | null
  weekly_balance: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// The add/edit modal form. `id` null = adding a new (manual) transaction; set =
// editing that transaction. `amount` is always a positive magnitude — `type`
// applies the sign on save.
interface TxForm {
  id: string | null
  account_id: string
  amount: string
  type: 'income' | 'expense'
  category: string
  description: string
  check_number: string
  date: string
  is_posted: boolean
  budget_account: '' | BudgetAccount
  notes: string
}

const emptyTx = (): TxForm => ({
  id: null, account_id: '', amount: '', type: 'expense', category: '',
  description: '', check_number: '', date: todayLocal(),
  is_posted: false, budget_account: 'chase_cc', notes: '',
})

// Plaid isn't wired up yet (no account-setup flow), so the ledger's Sync button
// is hidden. Flip to true once /api/plaid + account connection exist.
const SHOW_SYNC = false

// Cash-register money formatting: treat the raw digits as cents so the decimal
// point is inserted automatically. '5' → '0.05', '1234' → '12.34'.
function formatMoneyCents(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return ''
  return (parseInt(digits, 10) / 100).toFixed(2)
}

type Period = 'all' | '3m' | '6m' | string // string covers 'YYYY' and 'YYYY-MM'
type PostedFilter = 'all' | 'posted' | 'unposted'

// Format a Friday week-start (YYYY-MM-DD) as "Jul 11 – Jul 17" (Fri → Thu).
// Parse/format in UTC so the date the server computed isn't shifted by timezone.
function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00Z')
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${fmt(start)} – ${fmt(end)}`
}

// Friday (YYYY-MM-DD) that starts the Fri→Thu week containing `d`, matching the
// ledger's SQL week key. Computed in UTC so it never shifts by a day.
function weekStartOf(d: Date): string {
  const offset = (d.getDay() + 2) % 7 // Fri(5)→0, Thu(4)→6
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  utc.setUTCDate(utc.getUTCDate() - offset)
  return utc.toISOString().slice(0, 10)
}

// The six selectable weeks: last 2, current, next 3 (as Friday start dates).
function weekOptions(): { value: string; current: boolean }[] {
  const base = new Date(weekStartOf(new Date()) + 'T00:00:00Z')
  return [-2, -1, 0, 1, 2, 3].map((i) => {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + i * 7)
    return { value: d.toISOString().slice(0, 10), current: i === 0 }
  })
}

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

// Today as YYYY-MM-DD in the user's local timezone (not UTC — `toISOString()`
// would roll to tomorrow after ~5pm in the Americas).
function todayLocal(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function adjacentMonth(period: string, direction: -1 | 1): string {
  const [year, month] = period.split('-').map(Number)
  const date = new Date(year, month - 1 + direction)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// The browser's IANA timezone, so server-side "today" math (current week, the
// 3m/6m period filters) matches the user's local date instead of the DB's UTC.
function userTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

interface TxPage {
  rows: Transaction[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZES = [100, 300, 500, 1000]

// Windowed page numbers with ellipsis, e.g. [1, '…', 4, 5, 6, '…', 42].
function pageWindow(current: number, count: number): (number | 'gap')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const out: (number | 'gap')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(count - 1, current + 1)
  if (start > 2) out.push('gap')
  for (let p = start; p <= end; p++) out.push(p)
  if (end < count - 1) out.push('gap')
  out.push(count)
  return out
}

async function fetchTransactions(
  period: Period,
  accountId: string,
  categories: string[],
  posted: PostedFilter,
  page: number,
  pageSize: number
): Promise<TxPage> {
  const params = new URLSearchParams()
  if (period !== 'all') params.set('period', period)
  if (accountId !== 'all') params.set('account_id', accountId)
  // Repeated `category` params; an empty selection means "all categories".
  for (const c of categories) params.append('category', c)
  if (posted !== 'all') params.set('posted', posted)
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  params.set('tz', userTz())
  const res = await fetch(`/api/transactions?${params}`)
  if (!res.ok) throw new Error('Failed to fetch transactions')
  return res.json()
}

export function MonthlyLedger({ accounts, initialPeriod }: { accounts: Account[]; initialPeriod?: string }) {
  const qc = useQueryClient()
  // Open on the ?period=YYYY-MM deep link (e.g. after Budget "Add to Ledger"),
  // otherwise the current month.
  const [period, setPeriod] = useState<Period>(
    initialPeriod && /^\d{4}-\d{2}$/.test(initialPeriod) ? initialPeriod : '3m'
  )
  const [selectedAccount, setSelectedAccount] = useState<string>('all')
  // Add/edit transaction modal (replaces the old inline new/edit rows).
  const txDialogRef = useRef<HTMLDialogElement>(null)
  const [txForm, setTxForm] = useState<TxForm>(emptyTx)
  // Both filters live in the table column headers. Empty array / 'all' = the default,
  // which renders the bare column name rather than a count.
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [postedFilter, setPostedFilter] = useState<PostedFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [syncing, setSyncing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const tableRef = useRef<HTMLTableElement>(null)
  const deleteDialogRef = useRef<HTMLDialogElement>(null)
  const filtersDialogRef = useRef<HTMLDialogElement>(null)
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  // Add-to-weekly-budget modal
  const budgetDialogRef = useRef<HTMLDialogElement>(null)
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetWeek, setBudgetWeek] = useState<string>(() => weekStartOf(new Date()))

  // Week selected in the "1k Budget Spent" total card (independent of the ledger
  // period filter and of the current-week remaining card).
  const [totalWeek, setTotalWeek] = useState<string>(() => weekStartOf(new Date()))

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

  const { data: txPage, isLoading } = useQuery({
    // Categories join into the key so React Query treats each distinct selection as its
    // own cache entry (an array identity would change on every render).
    queryKey: ['transactions', period, selectedAccount, selectedCategories.join(','), postedFilter, page, pageSize],
    queryFn: () => fetchTransactions(period, selectedAccount, selectedCategories, postedFilter, page, pageSize),
    placeholderData: (prev) => prev, // keep the current page visible while the next loads
  })
  const transactions = txPage?.rows ?? []
  const total = txPage?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const { data: weeklyBudget } = useQuery<{ week_start: string; remaining: string }>({
    queryKey: ['weekly-budget'],
    queryFn: async () => {
      const res = await fetch(`/api/transactions/weekly-budget?tz=${encodeURIComponent(userTz())}`)
      if (!res.ok) throw new Error('Failed to fetch weekly budget')
      return res.json()
    },
  })

  // Total budget-flagged spend for the week chosen in the total card. Keyed under
  // 'weekly-budget' so existing mutation invalidations (prefix match) refresh it.
  const { data: weeklyTotal } = useQuery<{ week_start: string; spent: string }>({
    queryKey: ['weekly-budget', totalWeek],
    queryFn: async () => {
      const res = await fetch(`/api/transactions/weekly-budget?week_start=${totalWeek}`)
      if (!res.ok) throw new Error('Failed to fetch weekly total')
      return res.json()
    },
  })

  const addBudgetMutation = useMutation({
    mutationFn: async ({ week_start, amount }: { week_start: string; amount: number }) => {
      const res = await fetch('/api/transactions/weekly-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start, amount }),
      })
      if (!res.ok) throw new Error('Failed to add to weekly budget')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['weekly-budget'] })
      budgetDialogRef.current?.close()
      setBudgetAmount('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update transaction')
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['weekly-budget'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      txDialogRef.current?.close()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete transaction')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['weekly-budget'] })
    },
  })

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to create transaction')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['weekly-budget'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      txDialogRef.current?.close()
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/transactions/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Failed to delete transactions')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['weekly-budget'] })
      setSelectedIds(new Set())
    },
  })

  const bulkDuplicateMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/transactions/bulk-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Failed to duplicate transactions')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['weekly-budget'] })
      setSelectedIds(new Set())
    },
  })

  const markAsMutation = useMutation({
    mutationFn: async (body: { ids: string[]; field: MarkField; value: MarkValue }) => {
      const res = await fetch('/api/transactions/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update transactions')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['weekly-budget'] })
      setSelectedIds(new Set())
    },
  })

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const openAddTx = useCallback(() => {
    setTxForm(emptyTx())
    txDialogRef.current?.showModal()
  }, [])

  const openEditTx = useCallback((tx: Transaction) => {
    setTxForm({
      id: tx.id,
      account_id: tx.account_id ?? '',
      amount: Math.abs(parseFloat(tx.amount)).toFixed(2),
      type: tx.type as 'income' | 'expense',
      category: tx.category ?? '',
      description: tx.description ?? '',
      check_number: tx.check_number ?? '',
      date: tx.date.slice(0, 10),
      is_posted: tx.is_posted,
      budget_account: tx.budget_account ?? '',
      notes: tx.notes ?? '',
    })
    txDialogRef.current?.showModal()
  }, [])

  const saveTx = useCallback(() => {
    const amount = parseFloat(txForm.amount)
    const body = {
      account_id: txForm.account_id || null,
      amount: txForm.type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
      type: txForm.type,
      category: txForm.category || null,
      description: txForm.description || null,
      check_number: txForm.check_number || null,
      date: txForm.date,
      is_posted: txForm.is_posted,
      budget_account: txForm.budget_account || null,
      notes: txForm.notes || null,
    }
    if (txForm.id === null) createMutation.mutate(body)
    else updateMutation.mutate({ id: txForm.id, data: body })
  }, [txForm, createMutation, updateMutation])

  const canSaveTx =
    parseFloat(txForm.amount) > 0 && txForm.category.trim() !== '' && txForm.description.trim() !== ''

  // Changing any filter changes which rows are visible, so drop the selection.
  useEffect(() => {
    setSelectedIds(new Set())
  }, [period, selectedAccount, selectedCategories, postedFilter])

  // Filters / page-size change the result set — jump back to page 1.
  useEffect(() => {
    setPage(1)
  }, [period, selectedAccount, selectedCategories, postedFilter, pageSize])

  // Keep the page in range if the total shrinks (e.g. after a bulk delete).
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  // Description cells sit centered in a tall row (when Notes wrap), but top-align
  // when the description itself wraps to 2+ lines. The column has a fixed width, so
  // line count depends only on content — re-measure on data/row-state changes.
  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table) return
    const range = document.createRange()
    table.querySelectorAll<HTMLTableCellElement>('td.desc-col').forEach((cell) => {
      if (cell.querySelector('input')) {
        cell.classList.remove('desc-col--multiline')
        return
      }
      range.selectNodeContents(cell)
      cell.classList.toggle('desc-col--multiline', range.getClientRects().length >= 2)
    })
  }, [transactions, selectedCategories, selectedAccount])

  // Period/category filters and pagination are applied server-side; re-sort the
  // page defensively into checkbook order (seq desc). The running `balance` is
  // stored per row (server-maintained), so filtering never recomputes it.
  const sortedTx = [...transactions].sort((a, b) => {
    const sa = a.seq != null ? Number(a.seq) : -Infinity
    const sb = b.seq != null ? Number(b.seq) : -Infinity
    if (sb !== sa) return sb - sa
    if (b.date !== a.date) return b.date.localeCompare(a.date)
    return b.created_at.localeCompare(a.created_at)
  })
  const balanceOf = (tx: Transaction): number | null =>
    tx.balance != null ? parseFloat(tx.balance) : null

  const weeklyBalanceOf = (tx: Transaction): number | null =>
    tx.weekly_balance != null ? parseFloat(tx.weekly_balance) : null

  // Only manual rows are selectable (Plaid rows are protected from bulk delete).
  const selectableIds = sortedTx.filter((tx) => tx.is_manual).map((tx) => tx.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))
  const someSelected = selectableIds.some((id) => selectedIds.has(id))

  // Header check-all: indeterminate when only some visible rows are selected.
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected && !allSelected
    }
  }, [someSelected, allSelected])

  const toggleSelectAll = (checked: boolean) =>
    setSelectedIds(checked ? new Set(selectableIds) : new Set())

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/plaid/sync', { method: 'POST', body: JSON.stringify({}) })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['weekly-budget'] })
    } finally {
      setSyncing(false)
    }
  }

  const isMonthPeriod = /^\d{4}-\d{2}$/.test(period)
  const weeklyRemaining = weeklyBudget ? parseFloat(weeklyBudget.remaining) : null

  // The three filters + action buttons are shared between the desktop inline
  // controls row and the mobile Filters modal (Sync is desktop-only).
  const periodSelector = (
    <div className="period-selector">
      <span className="filter-chip">
        <CalendarDays size={14} />
        <select
          aria-label="Period"
          value={/^\d{4}-\d{2}$/.test(period) ? 'month' : period}
          onChange={(e) => {
            const val = e.target.value
            if (val === 'month') setPeriod(currentMonthPeriod())
            else setPeriod(val)
          }}
        >
          <option value="all">All Time</option>
          <option value="6m">Last 6 Months</option>
          <option value="3m">Last 3 Months</option>
          <option value="month">By Month</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </span>

      {isMonthPeriod && (
        <div className="month-nav">
          <button onClick={() => setPeriod(adjacentMonth(period, -1))}>‹</button>
          <span>{buildPeriodLabel(period)}</span>
          <button onClick={() => setPeriod(adjacentMonth(period, 1))}>›</button>
        </div>
      )}
    </div>
  )

  // Both filters render inside their own column header. Shared here so the mobile
  // Filters modal can reuse the exact same controls (the headers scroll off-screen on
  // a phone), keeping one source of truth for each filter.
  const categoryFilter = (
    <ColumnFilter
      label="Category"
      mode="multi"
      allLabel="All Categories"
      options={categories.map((c) => ({ value: c, label: c }))}
      selected={selectedCategories}
      onChange={setSelectedCategories}
      summary={selectedCategories.length > 0 ? String(selectedCategories.length) : null}
    />
  )

  const postedFilterControl = (
    <ColumnFilter
      label="Posted"
      mode="single"
      allLabel="All"
      options={[
        { value: 'posted', label: 'Posted' },
        { value: 'unposted', label: 'Unposted' },
      ]}
      selected={postedFilter === 'all' ? [] : [postedFilter]}
      onChange={(next) => setPostedFilter((next[0] as PostedFilter) ?? 'all')}
      summary={postedFilter === 'all' ? null : postedFilter === 'posted' ? 'Posted' : 'Unposted'}
    />
  )

  // `closeFirst` (mobile modal) dismisses the Filters modal before the action
  // runs, so a follow-up dialog (Add-to-1k, Delete confirm) isn't stacked on it.
  const actionButtons = (includeSync: boolean, closeFirst?: () => void) => {
    const run = (fn: () => void) => () => { closeFirst?.(); fn() }
    return (
      <>
        <div className="ledger-actions__group">
          {SHOW_SYNC && includeSync && (
            <button onClick={handleSync} disabled={syncing}>
              <RefreshCw size={14} /> {syncing ? 'Syncing…' : 'Sync'}
            </button>
          )}
        </div>
        <div className="ledger-actions__group">
          <MarkAsMenu
            disabled={selectedIds.size === 0}
            onPick={(field, value) => { closeFirst?.(); markAsMutation.mutate({ ids: Array.from(selectedIds), field, value }) }}
          />
          <button
            onClick={run(() => bulkDuplicateMutation.mutate(Array.from(selectedIds)))}
            disabled={selectedIds.size === 0 || bulkDuplicateMutation.isPending}
          >
            <Copy size={14} /> Duplicate
          </button>
          <button
            onClick={run(() => deleteDialogRef.current?.showModal())}
            disabled={selectedIds.size === 0}
          >
            <Trash2 size={14} /> Delete
          </button>
          <AddMenu
            onNewTransaction={run(openAddTx)}
            onAddWeekly={run(() => { setBudgetWeek(weekStartOf(new Date())); budgetDialogRef.current?.showModal() })}
          />
        </div>
      </>
    )
  }

  return (
    <div className="monthly-ledger">
      <div className="ledger-header">
        <h1>Monthly Budget</h1>

        <div className="weekly-cards">
          {weeklyRemaining !== null && weeklyBudget && (
            <div className="weekly-budget-card">
              <div className="weekly-budget-card__info">
                <span className="weekly-budget-card__label">This Week&apos;s $1,000 Budget</span>
                <span className="weekly-budget-card__range">{formatWeekRange(weeklyBudget.week_start)}</span>
              </div>
              <div className={`weekly-budget-card__amount${weeklyRemaining < 0 ? ' negative' : ''}`}>
                ${weeklyRemaining.toFixed(2)}
                <span className="weekly-budget-card__amount-label">left</span>
              </div>
            </div>
          )}

          <div className="weekly-budget-card weekly-budget-card--total">
            <div className="weekly-budget-card__info">
              <span className="weekly-budget-card__label">1k Budget Spent</span>
              <select
                className="weekly-budget-card__week"
                value={totalWeek}
                onChange={(e) => setTotalWeek(e.target.value)}
                aria-label="Select week"
              >
                {weekOptions().map((w) => (
                  <option key={w.value} value={w.value}>
                    {formatWeekRange(w.value)}{w.current ? ' (this week)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="weekly-budget-card__amount">
              ${weeklyTotal ? parseFloat(weeklyTotal.spent).toFixed(2) : '0.00'}
              <span className="weekly-budget-card__amount-label">spent</span>
            </div>
          </div>
        </div>

        {/* Desktop: full inline controls row (hidden on mobile). */}
        {/* Category/Posted moved into their column headers, so only Period remains here. */}
        <div className="ledger-controls ledger-controls--desktop">
          {periodSelector}
          <div className="ledger-actions ledger-actions--split">{actionButtons(true)}</div>
        </div>

        {/* Mobile: a single Filters button opening the modal below. */}
        <div className="ledger-controls-mobile">
          <button className="ledger-filters-btn" onClick={() => filtersDialogRef.current?.showModal()}>
            <SlidersHorizontal size={16} /> Filters
          </button>
        </div>
      </div>

      {isLoading && <Spinner />}

      <datalist id="categories-list">
        {categories.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className="ledger-table-wrap">
        <table className="ledger-table" ref={tableRef}>
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
              <th className="col-center">{postedFilterControl}</th>
              <th>{categoryFilter}</th>
              <th className="desc-col">Description</th>
              <th className="amount-col col-center">Amount</th>
              <th className="amount-col col-center">Balance</th>
              <th className="col-center">Budget</th>
              <th className="amount-col col-center">1K Weekly<br />Balance</th>
              <th className="notes-col">Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedTx.map((tx) => {
              const amount = parseFloat(tx.amount)
              const isCredit = amount >= 0

              return (
                <tr key={tx.id} className={isCredit ? 'credit-row' : 'debit-row'}>
                  <td className="col-center">
                    <input
                      type="checkbox"
                      disabled={!tx.is_manual}
                      checked={selectedIds.has(tx.id)}
                      onChange={() => toggleSelect(tx.id)}
                    />
                  </td>
                  <td>{tx.date.slice(0, 10)}</td>
                  <td className="col-center">{tx.is_posted ? <Check size={14} /> : ''}</td>
                  <td>{tx.category ?? ''}</td>
                  <td className="desc-col">{tx.description ?? ''}</td>
                  <td className={`col-center ${isCredit ? 'positive' : 'negative'}`}>
                    {isCredit ? '+' : '−'}{Math.abs(amount).toFixed(2)}
                  </td>
                  <td className={`col-center ${(balanceOf(tx) ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                    {balanceOf(tx)?.toFixed(2) ?? '—'}
                  </td>
                  <td className="col-center">
                    {tx.budget_account && (() => {
                      const { Icon, cls, label } = BUDGET_ICON[tx.budget_account]
                      return (
                        <Tooltip text={`${label} — counts toward the weekly budget`}>
                          <span className={`notes-icon ${cls}`}><Icon size={14} /></span>
                        </Tooltip>
                      )
                    })()}
                  </td>
                  <td className={`col-center ${(weeklyBalanceOf(tx) ?? 0) < 0 ? 'negative' : ''}`}>
                    {weeklyBalanceOf(tx)?.toFixed(2) ?? ''}
                  </td>
                  <td className="notes-col col-center">
                    <span className="ledger-cell-icons">
                      {tx.check_number ? (
                        <Tooltip text={`#${tx.check_number}`}>
                          <span className="notes-icon"><Banknote size={14} /></span>
                        </Tooltip>
                      ) : null}
                      {tx.notes ? (
                        <Tooltip text={tx.notes}>
                          <span className="notes-icon"><StickyNote size={14} /></span>
                        </Tooltip>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    <button className="icon-btn icon-btn--edit" onClick={() => openEditTx(tx)} aria-label="Edit"><Pencil size={16} /></button>
                    {tx.is_manual && (
                      <button className="icon-btn icon-btn--delete" onClick={() => deleteMutation.mutate(tx.id)} aria-label="Delete"><Trash2 size={16} /></button>
                    )}
                  </td>
                </tr>
              )
            })}

            {!isLoading && sortedTx.length === 0 && (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', padding: '2rem' }}>
                  No transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="ledger-pagination">
          <div className="ledger-pagination__size">
            <label>
              Rows:
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span className="ledger-pagination__count">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </span>
          </div>
          <div className="ledger-pagination__pages">
            <button onClick={() => setPage(1)} disabled={page === 1}>« First</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</button>
            {pageWindow(page, pageCount).map((p, i) =>
              p === 'gap' ? (
                <span key={`gap-${i}`} className="ledger-pagination__ellipsis">…</span>
              ) : (
                <button
                  key={p}
                  className={p === page ? 'active' : ''}
                  aria-current={p === page ? 'page' : undefined}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              )
            )}
            <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}>Next ›</button>
            <button onClick={() => setPage(pageCount)} disabled={page === pageCount}>Last »</button>
          </div>
        </div>
      )}

      <RecordModal
        dialogRef={budgetDialogRef}
        title="Add to weekly budget"
        onSave={() => addBudgetMutation.mutate({ week_start: budgetWeek, amount: parseFloat(budgetAmount) })}
        saving={addBudgetMutation.isPending}
        canSave={budgetAmount.trim() !== '' && !Number.isNaN(parseFloat(budgetAmount)) && parseFloat(budgetAmount) !== 0}
      >
        <ModalField label="Amount to add">
          <input
            type="number" step="0.01" autoFocus placeholder="0.00"
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(e.target.value)}
          />
        </ModalField>
        <ModalField label="Week">
          <select value={budgetWeek} onChange={(e) => setBudgetWeek(e.target.value)}>
            {weekOptions().map((w) => (
              <option key={w.value} value={w.value}>
                {formatWeekRange(w.value)}{w.current ? ' (this week)' : ''}
              </option>
            ))}
          </select>
        </ModalField>
      </RecordModal>

      <RecordModal
        dialogRef={txDialogRef}
        title={txForm.id === null ? 'New transaction' : 'Edit transaction'}
        onSave={saveTx}
        saving={createMutation.isPending || updateMutation.isPending}
        canSave={canSaveTx}
      >
        <ModalField label="Date">
          <input type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} />
        </ModalField>
        <ModalField label="Posted">
          <input type="checkbox" checked={txForm.is_posted} onChange={(e) => setTxForm({ ...txForm, is_posted: e.target.checked })} />
        </ModalField>
        <ModalField label="Category">
          <input list="categories-list" placeholder="Category"
            value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value.toUpperCase() })} />
        </ModalField>
        <ModalField label="Budget account">
          <select value={txForm.budget_account}
            onChange={(e) => {
              const val = e.target.value as '' | BudgetAccount
              // Check # only applies to the Bank account; clear it otherwise.
              setTxForm({ ...txForm, budget_account: val, check_number: val === 'bank' ? txForm.check_number : '' })
            }}>
            <option value="">N/A</option>
            {BUDGET_ACCOUNTS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </ModalField>
        <ModalField label="Description" full>
          <input placeholder="Description" value={txForm.description}
            onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} />
        </ModalField>
        <ModalField label="Type">
          <select value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value as 'income' | 'expense' })}>
            <option value="income">+ Credit</option>
            <option value="expense">− Debit</option>
          </select>
        </ModalField>
        <ModalField label="Amount">
          <input type="text" inputMode="numeric" placeholder="0.00"
            value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: formatMoneyCents(e.target.value) })} />
        </ModalField>
        {/* Check # only applies to the Bank (checking) account. */}
        {txForm.budget_account === 'bank' && (
          <ModalField label="Check #">
            <input placeholder="Check #" value={txForm.check_number}
              onChange={(e) => setTxForm({ ...txForm, check_number: e.target.value })} />
          </ModalField>
        )}
        <ModalField label="Notes" full>
          <input placeholder="Notes" value={txForm.notes}
            onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} />
        </ModalField>
      </RecordModal>

      <dialog ref={deleteDialogRef} className="confirm-dialog">
        <p>
          You are about to delete {selectedIds.size} transaction
          {selectedIds.size === 1 ? '' : 's'}. Do you want to proceed?
        </p>
        <div className="dialog-actions">
          <button onClick={() => deleteDialogRef.current?.close()}>Cancel</button>
          <button
            className="danger"
            onClick={() => {
              bulkDeleteMutation.mutate(Array.from(selectedIds))
              deleteDialogRef.current?.close()
            }}
          >
            Delete
          </button>
        </div>
      </dialog>

      {/* Mobile-only Filters modal (triggered by the mobile Filters button). */}
      <dialog
        ref={filtersDialogRef}
        className="modal ledger-filters-modal"
        onClick={(e) => { if (e.target === filtersDialogRef.current) filtersDialogRef.current?.close() }}
      >
        <div className="modal__content">
          <div className="modal__header">
            <h2>Filters</h2>
            <button className="modal__close" onClick={() => filtersDialogRef.current?.close()} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="ledger-filters-modal__body">
            <div className="ledger-filters-modal__field">
              <span className="ledger-filters-modal__label">Period</span>
              {periodSelector}
            </div>
            {/* These two carry their own label + active count in the trigger, so no
                separate __label span -- the column headers they mirror are off-screen
                behind horizontal scroll on a phone. */}
            <div className="ledger-filters-modal__field">{categoryFilter}</div>
            <div className="ledger-filters-modal__field">{postedFilterControl}</div>
            <div className="ledger-actions">
              {actionButtons(false, () => filtersDialogRef.current?.close())}
            </div>
          </div>
        </div>
      </dialog>
    </div>
  )
}
