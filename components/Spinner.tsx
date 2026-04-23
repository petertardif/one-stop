import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: number
}

export function Spinner({ size = 24 }: SpinnerProps) {
  return (
    <div className="spinner-wrap">
      <Loader2 size={size} className="spinner" />
    </div>
  )
}
