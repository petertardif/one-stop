'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

interface MultiSelectProps {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}

// Dropdown with checkbox options and click-outside dismissal. An empty
// selection means "all" (the caller shows every row). Presentation-only.
export function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value))
    else onChange([...selected, value])
  }

  const summary = selected.length === 0 ? `All ${label.toLowerCase()}` : selected.join(', ')

  return (
    <div className="multiselect" ref={ref}>
      <button
        type="button"
        className="multiselect-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="multiselect-summary">{summary}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="multiselect-menu" role="listbox">
          {options.length === 0 && <div className="multiselect-empty">No options</div>}
          {options.map((opt) => {
            const isSel = selected.includes(opt)
            return (
              <button
                type="button"
                key={opt}
                className={['multiselect-option', isSel ? 'selected' : ''].filter(Boolean).join(' ')}
                onClick={() => toggle(opt)}
                role="option"
                aria-selected={isSel}
              >
                <span className="multiselect-check">{isSel && <Check size={13} />}</span>
                {opt}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
