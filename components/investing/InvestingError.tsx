'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  message: string
  detail?: string | null
}

export function InvestingError({ message, detail }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="calculator__warning">
      <AlertTriangle size={16} />
      <div className="calculator__warning-body">
        <span>{message}</span>
        {detail && (
          <div className="calculator__dev-error">
            <button className="calculator__dev-error-toggle" onClick={() => setOpen((o) => !o)}>
              <span>Developer error</span>
              <span className={`calculator__dev-error-caret${open ? ' calculator__dev-error-caret--open' : ''}`}>▸</span>
            </button>
            {open && <pre className="calculator__dev-error-body">{detail}</pre>}
          </div>
        )}
      </div>
    </div>
  )
}
