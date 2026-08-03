'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

export interface ColumnFilterOption {
  value: string
  label: string
}

interface Props {
  /** Column name, shown as the header text (e.g. "Category"). */
  label: string
  options: ColumnFilterOption[]
  /** Empty array = the default "all" state. */
  selected: string[]
  onChange: (next: string[]) => void
  /** 'multi' keeps the menu open and toggles; 'single' picks one and closes. */
  mode: 'multi' | 'single'
  /**
   * Shown in parentheses after the label when a filter is active. Null/undefined
   * renders the bare column name, which is the default (all) state.
   */
  summary?: string | null
  /** Label for the option that clears the filter back to "all". */
  allLabel: string
  /** Optional leading icon, e.g. the calendar on the Period chip. */
  icon?: React.ReactNode
  /**
   * Extra class on the trigger. The ledger's Period filter passes `filter-chip` so it
   * keeps the pill look of the controls row while sharing this menu.
   */
  triggerClassName?: string
}

interface Coords {
  top: number
  left: number
}

// The Category/Posted filters live in the table header, but `.ledger-table-wrap` is an
// overflow:auto scroll container -- a menu rendered inline would be clipped by it. So the
// menu is portalled to the body and positioned from the trigger's rect, the same approach
// Tooltip.tsx uses, including dismissing on scroll/resize before the position goes stale.
export function ColumnFilter({
  label,
  options,
  selected,
  onChange,
  mode,
  summary,
  allLabel,
  icon,
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState<Coords | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  // The mobile Filters modal is a <dialog> opened with showModal(), which renders in the
  // browser's top layer -- above every z-index. Portalling to <body> from inside it would
  // put the menu behind the dialog, so target the dialog itself when we're within one.
  const portalTarget = (): HTMLElement =>
    triggerRef.current?.closest('dialog') ?? document.body

  const position = useCallback(() => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setCoords({ top: r.bottom + 4, left: r.left })
  }, [])

  useEffect(() => {
    if (!open) return
    position()

    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Closing (rather than repositioning) on scroll matches Tooltip: the trigger can
    // scroll out of the wrapper entirely, leaving a menu floating over unrelated rows.
    const onScrollOrResize = () => setOpen(false)

    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, position])

  const pick = (value: string) => {
    if (mode === 'single') {
      onChange(value ? [value] : [])
      setOpen(false)
      return
    }
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value))
    else onChange([...selected, value])
  }

  const isAll = selected.length === 0

  return (
    <div className="column-filter">
      <button
        type="button"
        ref={triggerRef}
        className={['column-filter__trigger', triggerClassName, isAll ? '' : 'is-active']
          .filter(Boolean)
          .join(' ')}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {icon}
        <span>
          {label}
          {summary ? ` (${summary})` : ''}
        </span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {mounted &&
        open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            className="column-filter__menu"
            role="listbox"
            style={{ top: coords.top, left: coords.left }}
          >
            <button
              type="button"
              role="option"
              aria-selected={isAll}
              className={['column-filter__option', isAll ? 'selected' : ''].filter(Boolean).join(' ')}
              onClick={() => {
                onChange([])
                if (mode === 'single') setOpen(false)
              }}
            >
              <span className="column-filter__check">{isAll && <Check size={13} />}</span>
              {allLabel}
            </button>

            {options.map((opt) => {
              const isSel = selected.includes(opt.value)
              return (
                <button
                  type="button"
                  key={opt.value}
                  role="option"
                  aria-selected={isSel}
                  className={['column-filter__option', isSel ? 'selected' : ''].filter(Boolean).join(' ')}
                  onClick={() => pick(opt.value)}
                >
                  <span className="column-filter__check">{isSel && <Check size={13} />}</span>
                  {opt.label}
                </button>
              )
            })}
          </div>,
          portalTarget()
        )}
    </div>
  )
}
