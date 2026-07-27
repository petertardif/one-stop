'use client'

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  /** Tooltip text. When empty/null the child renders untouched (no wrapper). */
  text: ReactNode
  children: ReactElement
  /** Preferred side; flips automatically when there isn't room. */
  placement?: 'top' | 'bottom'
  /** Show delay in ms. */
  delay?: number
}

type Coords = { top: number; left: number; caret: number; placement: 'top' | 'bottom' }

const GAP = 8
const MARGIN = 6

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref && typeof ref === 'object') (ref as { current: T | null }).current = value
}

/**
 * Styled hover/focus tooltip that replaces the native `title` attribute — fast
 * (configurable delay, not the browser's ~1s), themed with app tokens, and
 * rendered in a portal so it's never clipped by scrolling tables and can flip
 * near the viewport edges. Clones its single child to attach handlers, so it
 * adds no wrapper element and preserves layout.
 */
export function Tooltip({ text, children, placement = 'top', delay = 150 }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<Coords | null>(null)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()

  useEffect(() => setMounted(true), [])

  const clearTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }
  const show = useCallback(() => {
    clearTimer()
    timer.current = setTimeout(() => setOpen(true), delay)
  }, [delay])
  const hide = useCallback(() => { clearTimer(); setOpen(false) }, [])

  useEffect(() => () => clearTimer(), [])

  // Dismiss on Escape, and on scroll/resize (position would otherwise go stale).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [open, hide])

  // Measure and place once the bubble is in the DOM.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !bubbleRef.current) return
    const t = triggerRef.current.getBoundingClientRect()
    const b = bubbleRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let side = placement
    let top = side === 'top' ? t.top - b.height - GAP : t.bottom + GAP
    if (side === 'top' && top < MARGIN) { side = 'bottom'; top = t.bottom + GAP }
    else if (side === 'bottom' && top + b.height > vh - MARGIN) { side = 'top'; top = t.top - b.height - GAP }

    const centerX = t.left + t.width / 2
    let left = centerX - b.width / 2
    left = Math.max(MARGIN, Math.min(left, vw - b.width - MARGIN))
    setCoords({ top, left, caret: centerX - left, placement: side })
  }, [open, placement, text])

  if (text == null || text === '') return children
  if (!isValidElement(children)) return children

  const childRef = (children as ReactElement & { ref?: Ref<HTMLElement> }).ref
  const childProps = children.props as Record<string, unknown>
  const compose = (own: unknown, mine: () => void) => (e: unknown) => {
    if (typeof own === 'function') (own as (ev: unknown) => void)(e)
    mine()
  }

  const trigger = cloneElement(children as ReactElement, {
    ref: (node: HTMLElement | null) => { triggerRef.current = node; setRef(childRef, node) },
    onPointerEnter: compose(childProps.onPointerEnter, show),
    onPointerLeave: compose(childProps.onPointerLeave, hide),
    onFocus: compose(childProps.onFocus, show),
    onBlur: compose(childProps.onBlur, hide),
    'aria-describedby': open ? id : (childProps['aria-describedby'] as string | undefined),
  } as Record<string, unknown>)

  return (
    <>
      {trigger}
      {mounted && open && createPortal(
        <div
          ref={bubbleRef}
          id={id}
          role="tooltip"
          className={`app-tooltip app-tooltip--${coords?.placement ?? placement}`}
          style={{
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            visibility: coords ? 'visible' : 'hidden',
          }}
        >
          {text}
          {coords && (
            <span className="app-tooltip__caret" style={{ left: coords.caret }} />
          )}
        </div>,
        document.body
      )}
    </>
  )
}
