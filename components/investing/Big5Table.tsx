import type { GrowthRates } from '@/lib/indicators'

interface Big5Data {
  salesGrowth: GrowthRates
  epsGrowth: GrowthRates
  equityGrowth: GrowthRates
  fcfGrowth: GrowthRates
  roic: number | null
}

function pct(v: number | null) {
  if (v === null) return <span className="big5-cell--null">n/a</span>
  const cls = Math.abs(v) >= 0.1 ? 'big5-cell--pass' : 'big5-cell--fail'
  return <span className={cls}>{(v * 100).toFixed(1)}%</span>
}

function roicCell(v: number | null) {
  if (v === null) return <span className="big5-cell--null">n/a</span>
  const cls = v >= 0.1 ? 'big5-cell--pass' : 'big5-cell--fail'
  return <span className={cls}>{(v * 100).toFixed(1)}%</span>
}

export function Big5Table({ data }: { data: Big5Data }) {
  const rows: { label: string; rates: GrowthRates | null; isRoic?: boolean }[] = [
    { label: 'Sales Growth', rates: data.salesGrowth },
    { label: 'EPS Growth', rates: data.epsGrowth },
    { label: 'Equity Growth', rates: data.equityGrowth },
    { label: 'Free Cash Flow', rates: data.fcfGrowth },
    { label: 'ROIC', rates: null, isRoic: true },
  ]

  return (
    <table className="big5-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>1 Year</th>
          <th>5 Year</th>
          <th>10 Year</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td className="big5-table__metric">{row.label}</td>
            {row.isRoic ? (
              <>
                <td colSpan={2} />
                <td>{roicCell(data.roic)}</td>
              </>
            ) : (
              <>
                <td>{pct(row.rates!.y1)}</td>
                <td>{pct(row.rates!.y5)}</td>
                <td>{pct(row.rates!.y10)}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
