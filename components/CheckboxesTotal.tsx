'use client'

import { useCallback, useMemo, useState } from 'react'
import { money } from '@/lib/format'

// One checked row. Selection outlives the page/week it was checked on, so the amount is
// cached here rather than looked up later in data that may no longer be loaded. `meta`
// carries whatever else the host table needs to remember about the row (the ledger keeps
// `isManual` to decide which rows its bulk actions may touch); pass undefined when unused.
export interface SelectedRow<M> {
  amount: number
  meta: M
}

// A row as the caller describes it when selecting or re-syncing.
export interface SelectableRow<M> {
  id: string
  amount: number
  meta: M
}

export interface RowSelection<M> {
  size: number
  has: (id: string) => boolean
  entries: [string, SelectedRow<M>][]
  /** Check/uncheck one row. */
  toggle: (row: SelectableRow<M>) => void
  /** Add or remove a batch (a header select-all over the visible rows). */
  setMany: (rows: SelectableRow<M>[], checked: boolean) => void
  /** Drop specific ids — what a completed bulk action removes. */
  deselect: (ids: string[]) => void
  /** Drop everything, including rows not currently visible. */
  clear: () => void
  /** Refresh cached amounts for any selected row present in `rows` (they go stale on edit). */
  sync: (rows: SelectableRow<M>[]) => void
  /** Sum of every checked amount, in dollars. */
  total: number
  /** '' | 'positive' | 'negative' — drives the card's color. */
  tone: string
}

// Shared row-selection state behind the Checkboxes Total card. Deliberately survives
// paging, filter changes, and week changes; only `clear` (the card's Clear button) and
// completed bulk actions remove rows.
export function useRowSelection<M = undefined>(): RowSelection<M> {
  const [selected, setSelected] = useState<Map<string, SelectedRow<M>>>(new Map())

  const toggle = useCallback((row: SelectableRow<M>) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(row.id)) next.delete(row.id)
      else next.set(row.id, { amount: row.amount, meta: row.meta })
      return next
    })
  }, [])

  const setMany = useCallback((rows: SelectableRow<M>[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev)
      for (const row of rows) {
        if (checked) next.set(row.id, { amount: row.amount, meta: row.meta })
        else next.delete(row.id)
      }
      return next
    })
  }, [])

  const deselect = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const next = new Map(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }, [])

  const clear = useCallback(() => setSelected(new Map()), [])

  const sync = useCallback((rows: SelectableRow<M>[]) => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      let changed = false
      const next = new Map(prev)
      for (const row of rows) {
        const cur = next.get(row.id)
        if (!cur) continue
        if (cur.amount !== row.amount) {
          next.set(row.id, { amount: row.amount, meta: row.meta })
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  // Summed in whole cents so a selection that nets out reads as an exact 0.00 (and black)
  // rather than a floating-point crumb.
  const total = useMemo(
    () => Array.from(selected.values()).reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100,
    [selected]
  )

  return {
    size: selected.size,
    has: (id) => selected.has(id),
    entries: Array.from(selected),
    toggle,
    setMany,
    deselect,
    clear,
    sync,
    total,
    tone: total > 0 ? 'positive' : total < 0 ? 'negative' : '',
  }
}

// Running total of every checked row. Renders nothing while the selection is empty; sits
// in a `.weekly-cards` row alongside the other cards.
export function CheckboxesTotalCard<M>({ selection }: { selection: RowSelection<M> }) {
  if (selection.size === 0) return null

  return (
    <div className="weekly-budget-card weekly-budget-card--checkbox-total">
      <div className="weekly-budget-card__info">
        <span className="weekly-budget-card__label">Checkboxes Total</span>
        <button type="button" className="weekly-budget-card__clear" onClick={selection.clear}>
          {selection.size} selected — Clear
        </button>
      </div>
      <div className={`weekly-budget-card__amount ${selection.tone}`}>
        {money(selection.total)}
        <span className="weekly-budget-card__amount-label">total</span>
      </div>
    </div>
  )
}
