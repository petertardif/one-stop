interface SpinnerProps {
  size?: number
}

export function Spinner({ size = 40 }: SpinnerProps) {
  return (
    <div className="spinner-wrap">
      <img
        src="/spinner-vault.svg"
        alt="Loading…"
        width={size}
        height={size}
        className="spinner-vault"
      />
    </div>
  )
}
