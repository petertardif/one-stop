'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { Spinner } from '@/components/Spinner'

// Work finishing inside SHOW_DELAY_MS never shows a spinner, so quick saves don't flicker.
// Once shown it stays for at least MIN_VISIBLE_MS, so it can't strobe on borderline work.
const SHOW_DELAY_MS = 150
const MIN_VISIBLE_MS = 400

// A hold that is never released would wedge the overlay open forever. Every hold expires
// on its own, so a missed release costs a stale spinner for a few seconds, not a dead UI.
const HOLD_TIMEOUT_MS = 15_000

/** Hold taken at sign-in and released by the destination page once it is ready. */
export const AUTH_REDIRECT_HOLD = 'auth-redirect'

interface BusyControls {
  retain: () => void
  release: () => void
  hold: (key: string) => void
  releaseHold: (key: string) => void
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

/**
 * Keep the overlay up across a route change — `useBusyWhile` cannot, because it releases
 * when its component unmounts, which is exactly what a redirect does. Take a hold before
 * navigating and release it from the destination once that page is ready.
 */
export function useBusyHold(): Pick<BusyControls, 'hold' | 'releaseHold'> {
  const controls = useContext(BusyContext)
  const hold = useCallback((key: string) => controls?.hold(key), [controls])
  const releaseHold = useCallback((key: string) => controls?.releaseHold(key), [controls])
  return { hold, releaseHold }
}

export function BusyProvider({ children }: { children: React.ReactNode }) {
  const [manual, setManual] = useState(0)
  const [holds, setHolds] = useState<string[]>([])
  const holdTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const releaseHold = useCallback((key: string) => {
    const timer = holdTimers.current.get(key)
    if (timer) {
      clearTimeout(timer)
      holdTimers.current.delete(key)
    }
    setHolds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev))
  }, [])

  const hold = useCallback(
    (key: string) => {
      const existing = holdTimers.current.get(key)
      if (existing) clearTimeout(existing)
      holdTimers.current.set(key, setTimeout(() => releaseHold(key), HOLD_TIMEOUT_MS))
      setHolds((prev) => (prev.includes(key) ? prev : [...prev, key]))
    },
    [releaseHold]
  )

  // Capture the map itself: holdTimers.current would be re-read at cleanup time.
  useEffect(() => {
    const timers = holdTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])

  const controls = useMemo<BusyControls>(
    () => ({
      retain: () => setManual((n) => n + 1),
      release: () => setManual((n) => n - 1),
      hold,
      releaseHold,
    }),
    [hold, releaseHold]
  )

  return (
    <BusyContext.Provider value={controls}>
      {children}
      <BusyOverlay busy={manual > 0 || holds.length > 0} />
    </BusyContext.Provider>
  )
}

// Rendered as a <dialog> so it lands in the browser's top layer — above page
// content *and* above any modal still open while its own save is in flight
// (a plain z-index overlay would paint underneath an open modal dialog).
function BusyOverlay({ busy }: { busy: boolean }) {
  const mutating = useIsMutating()
  const active = mutating > 0 || busy
  const [visible, setVisible] = useState(false)
  const shownAt = useRef(0)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (active === visible) return
    let timer: ReturnType<typeof setTimeout>

    if (active) {
      timer = setTimeout(() => {
        shownAt.current = Date.now()
        setVisible(true)
      }, SHOW_DELAY_MS)
    } else {
      const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current))
      timer = setTimeout(() => setVisible(false), remaining)
    }

    return () => clearTimeout(timer)
  }, [active, visible])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (visible && !el.open) el.showModal()
    else if (!visible && el.open) el.close()
  }, [visible])

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
