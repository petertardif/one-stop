interface SpinnerProps {
  size?: number
}

// Vault-wheel spokes, evenly spaced every 45 degrees around the hub.
const SPOKES = [
  'translate(0,-26)',
  'translate(18.38,-18.38) rotate(45)',
  'translate(26,0) rotate(90)',
  'translate(18.38,18.38) rotate(135)',
  'translate(0,26) rotate(180)',
  'translate(-18.38,18.38) rotate(225)',
  'translate(-26,0) rotate(270)',
  'translate(-18.38,-18.38) rotate(315)',
]

/**
 * The artwork is inlined rather than loaded from /spinner-vault.svg via <img>. As an
 * external image it could fail to load — leaving a rotating broken-image icon, since the
 * CSS animation applies to the <img> element whether or not its source resolved. Inline
 * markup cannot 404, needs no extra request, and paints with the rest of the component.
 */
export function Spinner({ size = 40 }: SpinnerProps) {
  return (
    <div className="spinner-wrap">
      <svg
        className="spinner-vault"
        width={size}
        height={size}
        viewBox="-40 -40 80 80"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Loading…"
      >
        <g fill="#437159">
          <circle cx="0" cy="0" r="20" />
          {SPOKES.map((transform) => (
            <g key={transform} transform={transform}>
              <rect x="-3.5" y="-11" width="7" height="20" rx="2" />
            </g>
          ))}
        </g>
        <circle cx="0" cy="0" r="3" fill="#FFFFFF" />
      </svg>
    </div>
  )
}
