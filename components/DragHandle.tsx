'use client'

import { useCallback, useEffect, useState } from 'react'
import { GripVertical } from 'lucide-react'
import { Tooltip } from '@/components/Tooltip'

/**
 * Handle-only drag-to-reorder. A table row is `draggable` only while its grip is
 * pressed (`armedId === row.id`), so pressing anywhere else selects text normally.
 */
export function useDragHandle() {
  const [armedId, setArmedId] = useState<string | null>(null)
  const disarm = useCallback(() => setArmedId(null), [])
  useEffect(() => {
    if (!armedId) return
    // A press that never turns into a drag still has to release the row.
    window.addEventListener('mouseup', disarm)
    return () => window.removeEventListener('mouseup', disarm)
  }, [armedId, disarm])
  return { armedId, arm: setArmedId, disarm }
}

export function DragHandle({ onArm }: { onArm: () => void }) {
  return (
    <Tooltip text="Drag to reorder">
      <span className="drag-handle" onMouseDown={onArm} aria-hidden>
        <GripVertical size={14} />
      </span>
    </Tooltip>
  )
}
