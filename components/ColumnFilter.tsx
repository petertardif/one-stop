'use client'

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
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

interface MenuPos {
  /** Exactly one of top/bottom is set — `bottom` anchors an upward flip without measuring height. */
  top?: number
  bottom?: number
  left: number
  maxHeight: number
}

const GAP = 4 // between trigger and menu
const EDGE = 8 // minimum breathing room against the viewport edge
const PREFERRED_HEIGHT = 280
const MIN_HEIGHT = 140

/**
 * Dropdown used by the ledger's column headers and its Period chip.
 *
 * The menu is portalled and `position: fixed`, so it is measured against the viewport
 * rather than its container. That lets it hang outside the mobile Filters modal, over the
 * backdrop, instead of being clipped by `.modal`'s `overflow-y: auto` — while still being
 * clamped so it can never run off the screen itself.
 */
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
  const [pos, setPos] = useState<MenuPos | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  // The mobile Filters modal is a <dialog> opened with showModal(), which renders in the
  // browser's top layer -- above every z-index. Portalling to <body> from inside it would
  // put the menu behind the dialog, so target the dialog itself when we're within one.
  const portalTarget = (): HTMLElement =>
    triggerRef.current?.closest('dialog') ?? document.body

  const position = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Trigger scrolled fully out of view: the menu would float over unrelated content.
    if (r.bottom < 0 || r.top > vh) {
      setOpen(false)
      return
    }

    const spaceBelow = vh - r.bottom - GAP - EDGE
    const spaceAbove = r.top - GAP - EDGE

    // Prefer opening downward; flip up only when that genuinely has more room.
    const placeBelow = spaceBelow >= MIN_HEIGHT || spaceBelow >= spaceAbove
    const available = placeBelow ? spaceBelow : spaceAbove
    // No lower bound here on purpose. MIN_HEIGHT decides which side to open on; applying
    // it as a floor would push the menu back off-screen when neither side has that much
    // room (a landscape phone with the keyboard up). Better a short, scrollable menu.
    const maxHeight = Math.min(PREFERRED_HEIGHT, Math.max(0, available))

    // Clamp horizontally using the rendered width once it exists, so a trigger near the
    // right edge slides left instead of spilling off-screen.
    const width = menuRef.current?.offsetWidth ?? 200
    const left = Math.max(EDGE, Math.min(r.left, vw - width - EDGE))

    setPos(
      placeBelow
        ? { top: r.bottom + GAP, left, maxHeight }
        : { bottom: vh - r.top + GAP, left, maxHeight }
    )
  }, [])

  // Layout effect so the menu is measured and placed before the browser paints it.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    position()
  }, [open, position])

  useEffect(() => {
    if (!open) return

    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Reposition rather than close: the menu can sit outside the modal, so scrolling the
    // modal to reach it must not dismiss it. Capture catches scrolls on any ancestor.
    const onScrollOrResize = () => position()

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
        createPortal(
          <div
            ref={menuRef}
            className="column-filter__menu"
            role="listbox"
            style={{
              top: pos?.top,
              bottom: pos?.bottom,
              left: pos?.left,
              maxHeight: pos?.maxHeight,
              // Hidden for the first frame, before measurement has placed it.
              visibility: pos ? 'visible' : 'hidden',
            }}
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
