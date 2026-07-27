interface ComingSoonProps {
  title: string
}

export function ComingSoon({ title }: ComingSoonProps) {
  return (
    <div className="page-container">
      <h1 className="page-title">{title}</h1>
      <p className="coming-soon">Coming soon</p>
    </div>
  )
}
