import { OctagonAlert } from 'lucide-react'

export function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="auth-error">
      <OctagonAlert size={14} />
      {message}
    </p>
  )
}
