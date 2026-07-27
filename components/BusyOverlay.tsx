'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { Spinner } from '@/components/Spinner'

interface BusyControls {
  retain: () => void
  release: () => void
}

const BusyContext = createContext<BusyControls | null>(null)

/**
 * Show the page-level busy overlay for as long as `active` is true. Only needed
 * by components that track their own `saving`/`isSubmitting` flag — React Query
 * mutations (inline-edit saves, modal saves, deletes, reorders) are detected
 * automatically via useIsMutating.
 */
export function useBusyWhile(active: boolean) {
  const controls = useContext(BusyContext)
  useEffect(() => {
    if (!active || !controls) return
    controls.retain()
    return controls.release
  }, [active, controls])
}

export function BusyProvider({ children }: { children: React.ReactNode }) {
  const [manual, setManual] = useState(0)

  const controls = useMemo<BusyControls>(
    () => ({
      retain: () => setManual((n) => n + 1),
      release: () => setManual((n) => n - 1),
    }),
    []
  )

  return (
    <BusyContext.Provider value={controls}>
      {children}
      <BusyOverlay manual={manual} />
    </BusyContext.Provider>
  )
}

// Rendered as a <dialog> so it lands in the browser's top layer — above page
// content *and* above any modal still open while its own save is in flight
// (a plain z-index overlay would paint underneath an open modal dialog).
function BusyOverlay({ manual }: { manual: number }) {
  const mutating = useIsMutating()
  const busy = mutating > 0 || manual > 0
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (busy && !el.open) el.showModal()
    else if (!busy && el.open) el.close()
  }, [busy])

  return (
    <dialog
      ref={ref}
      className="busy-overlay"
      aria-label="Working…"
      // Escape must not dismiss the overlay — the action is still running.
      onCancel={(e) => e.preventDefault()}
    >
      <Spinner />
    </dialog>
  )
}
