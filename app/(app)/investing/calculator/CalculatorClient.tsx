'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, RefreshCw, AlertTriangle, Pencil, Info } from 'lucide-react'
import { Big5Table } from '@/components/investing/Big5Table'
import { StickerPricePanel } from '@/components/investing/StickerPricePanel'
import { calcSticker } from '@/lib/indicators'
import { Spinner } from '@/components/Spinner'
import { ErrorMessage } from '@/components/ErrorMessage'

type CalcStatus = 'idle' | 'loading' | 'api-success' | 'api-refresh-success' | 'api-failure' | 'saved'

interface GrowthRates { y1: number | null; y5: number | null; y10: number | null }

interface Big5Snapshot {
  salesGrowth: GrowthRates
  epsGrowth: GrowthRates
  equityGrowth: GrowthRates
  fcfGrowth: GrowthRates
  roic: GrowthRates | number | null
  currentEps: number | null
  currentPrice: number | null
  analystEstimate: number | null
}

interface DisplayData {
  companyName: string
  sector: string | null
  currentPrice: number | null
  currentEps: number | null
  salesGrowth: GrowthRates
  epsGrowth: GrowthRates
  equityGrowth: GrowthRates
  fcfGrowth: GrowthRates
  roic: GrowthRates
  effectiveGrowthRate: number
  analystGrowthRate: number | null
  savedAt?: string
}

interface ManualForm {
  companyName: string; sector: string
  currentEps: string; analystEstimate: string
  salesY1: string; salesY5: string; salesY10: string
  epsY1: string; epsY5: string; epsY10: string
  equityY1: string; equityY5: string; equityY10: string
  fcfY1: string; fcfY5: string; fcfY10: string
  roicY1: string; roicY5: string; roicY10: string
}

const emptyForm = (): ManualForm => ({
  companyName: '', sector: '', currentEps: '', analystEstimate: '',
  salesY1: '', salesY5: '', salesY10: '',
  epsY1: '', epsY5: '', epsY10: '',
  equityY1: '', equityY5: '', equityY10: '',
  fcfY1: '', fcfY5: '', fcfY10: '',
  roicY1: '', roicY5: '', roicY10: '',
})

function pct(s: string): number | null {
  const n = parseFloat(s)
  return isNaN(n) ? null : n / 100
}

function num(s: string): number | null {
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function displayDataToForm(d: DisplayData): ManualForm {
  const fp = (v: number | null) => (v !== null ? (v * 100).toFixed(2) : '')
  const fn = (v: number | null) => (v !== null ? String(v) : '')
  return {
    companyName: d.companyName === '—' ? '' : d.companyName,
    sector: d.sector ?? '',
    currentEps: fn(d.currentEps),
    analystEstimate: fp(d.analystGrowthRate),
    salesY1: fp(d.salesGrowth.y1), salesY5: fp(d.salesGrowth.y5), salesY10: fp(d.salesGrowth.y10),
    epsY1: fp(d.epsGrowth.y1), epsY5: fp(d.epsGrowth.y5), epsY10: fp(d.epsGrowth.y10),
    equityY1: fp(d.equityGrowth.y1), equityY5: fp(d.equityGrowth.y5), equityY10: fp(d.equityGrowth.y10),
    fcfY1: fp(d.fcfGrowth.y1), fcfY5: fp(d.fcfGrowth.y5), fcfY10: fp(d.fcfGrowth.y10),
    roicY1: fp(d.roic.y1), roicY5: fp(d.roic.y5), roicY10: fp(d.roic.y10),
  }
}

function formToDisplayData(f: ManualForm): DisplayData {
  return {
    companyName: f.companyName || '—',
    sector: f.sector || null,
    currentPrice: null,
    currentEps: num(f.currentEps),
    salesGrowth: { y1: pct(f.salesY1), y5: pct(f.salesY5), y10: pct(f.salesY10) },
    epsGrowth: { y1: pct(f.epsY1), y5: pct(f.epsY5), y10: pct(f.epsY10) },
    equityGrowth: { y1: pct(f.equityY1), y5: pct(f.equityY5), y10: pct(f.equityY10) },
    fcfGrowth: { y1: pct(f.fcfY1), y5: pct(f.fcfY5), y10: pct(f.fcfY10) },
    roic: { y1: pct(f.roicY1), y5: pct(f.roicY5), y10: pct(f.roicY10) },
    analystGrowthRate: pct(f.analystEstimate),
    effectiveGrowthRate: (() => {
      const eps10 = pct(f.epsY10)
      const analyst = pct(f.analystEstimate)
      const candidates = [eps10, analyst].filter((v): v is number => v !== null)
      return candidates.length > 0 ? Math.max(0, Math.min(...candidates)) : 0
    })(),
  }
}

function savedEntryToDisplayData(entry: {
  company_name: string
  sector: string | null
  growth_rate_used: number | null
  big5_data: Big5Snapshot | null
  added_at: string
}): DisplayData {
  const b = entry.big5_data
  const nullRates: GrowthRates = { y1: null, y5: null, y10: null }
  return {
    companyName: entry.company_name,
    sector: entry.sector,
    currentPrice: b?.currentPrice ?? null,
    currentEps: b?.currentEps ?? null,
    salesGrowth: b?.salesGrowth ?? nullRates,
    epsGrowth: b?.epsGrowth ?? nullRates,
    equityGrowth: b?.equityGrowth ?? nullRates,
    fcfGrowth: b?.fcfGrowth ?? nullRates,
    roic: (b?.roic !== null && typeof b?.roic === 'object')
      ? (b.roic as GrowthRates)
      : { y1: (b?.roic as number | null) ?? null, y5: null, y10: null },
    effectiveGrowthRate: Number(entry.growth_rate_used ?? 0),
    analystGrowthRate: b?.analystEstimate ?? null,
    savedAt: entry.added_at,
  }
}

export function CalculatorClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [ticker, setTicker] = useState('')
  const [status, setStatus] = useState<CalcStatus>('idle')
  const [displayData, setDisplayData] = useState<DisplayData | null>(null)
  const [manualForm, setManualForm] = useState<ManualForm>(emptyForm())
  const [growthOverride, setGrowthOverride] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [priceFetchFailed, setPriceFetchFailed] = useState(false)
  const [manualPriceInput, setManualPriceInput] = useState('')

  async function fetchLivePrice(t: string) {
    const res = await fetch(`/api/investing/fmp/${t}?data=price`)
    if (res.ok) {
      const json = await res.json()
      setLivePrice(json.price)
    } else {
      setPriceFetchFailed(true)
    }
  }

  async function analyze(t: string, { skipDbCheck = false } = {}) {
    setStatus('loading')
    setDisplayData(null)
    setGrowthOverride('')
    setSaveError(null)
    setApiError(null)
    setRefreshError(null)
    setIsEditing(false)
    setLivePrice(null)
    setPriceFetchFailed(false)
    setManualPriceInput('')

    if (!skipDbCheck) {
      const dbRes = await fetch(`/api/investing/watchlist/${t}`)
      if (dbRes.ok) {
        const json = await dbRes.json()
        setDisplayData(savedEntryToDisplayData(json.entry))
        setStatus('saved')
        void fetchLivePrice(t)
        return
      }
    }

    const fmpRes = await fetch(`/api/investing/fmp/${t}?data=big5`)
    if (fmpRes.ok) {
      const json = await fmpRes.json()
      setDisplayData({
        companyName: json.profile.companyName,
        sector: json.profile.sector,
        currentPrice: json.profile.price,
        currentEps: json.profile.eps,
        salesGrowth: json.salesGrowth,
        epsGrowth: json.epsGrowth,
        equityGrowth: json.equityGrowth,
        fcfGrowth: json.fcfGrowth,
        roic: json.roic,
        effectiveGrowthRate: json.effectiveGrowthRate,
        analystGrowthRate: json.analystGrowthRate,
      })
      setStatus(skipDbCheck ? 'api-refresh-success' : 'api-success')
      return
    }

    if (skipDbCheck) {
      // Refresh failed — restore saved state so existing data isn't lost
      try {
        const errJson = await fmpRes.json()
        setRefreshError(errJson.error ?? 'Could not fetch from API.')
      } catch {
        setRefreshError('Could not fetch from API.')
      }
      const dbRes = await fetch(`/api/investing/watchlist/${t}`)
      if (dbRes.ok) {
        const json = await dbRes.json()
        setDisplayData(savedEntryToDisplayData(json.entry))
      }
      setStatus('saved')
      void fetchLivePrice(t)
      return
    }

    try {
      const errJson = await fmpRes.json()
      setApiError(errJson.error ?? 'Could not fetch data from API.')
    } catch {
      setApiError('Could not fetch data from API.')
    }
    setManualForm(emptyForm())
    setStatus('api-failure')
    void fetchLivePrice(t)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = input.trim().toUpperCase()
    if (!t) return
    setTicker(t)
    analyze(t)
  }

  function setField(key: keyof ManualForm, value: string) {
    setManualForm((prev) => ({ ...prev, [key]: value }))
  }

  const activeData = (status === 'api-failure' || isEditing) ? formToDisplayData(manualForm) : displayData
  const baseGrowthRate = activeData?.effectiveGrowthRate ?? 0
  const effectiveRate = growthOverride !== '' ? parseFloat(growthOverride) / 100 : baseGrowthRate
  const currentEps = activeData?.currentEps ?? null
  const stickerDisplay = currentEps !== null && currentEps > 0
    ? calcSticker(currentEps, effectiveRate)
    : null
  const manualPrice = priceFetchFailed && manualPriceInput ? parseFloat(manualPriceInput) : null
  const displayPrice = livePrice ?? manualPrice ?? activeData?.currentPrice ?? null

  function buildPayload(data: DisplayData) {
    return {
      ticker,
      company_name: data.companyName,
      sector: data.sector,
      sticker_price: stickerDisplay?.stickerPrice ?? null,
      mos_price: stickerDisplay?.mosPrice ?? null,
      growth_rate_used: effectiveRate,
      big5_data: {
        salesGrowth: data.salesGrowth,
        epsGrowth: data.epsGrowth,
        equityGrowth: data.equityGrowth,
        fcfGrowth: data.fcfGrowth,
        roic: data.roic,
        currentEps: data.currentEps,
        currentPrice: displayPrice,
        analystEstimate: data.analystGrowthRate,
      },
    }
  }

  async function saveToWatchlist() {
    if (!activeData || !ticker) return
    setSaving(true)
    setSaveError(null)
    const res = await fetch('/api/investing/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(activeData)),
    })
    if (!res.ok) {
      const err = await res.json()
      setSaveError(err.error ?? 'Failed to save')
      setSaving(false)
      return
    }
    setDisplayData({ ...activeData, savedAt: new Date().toISOString() })
    setStatus('saved')
    setSaving(false)
  }

  async function addToWatchlist() {
    if (!displayData || !ticker) return
    setSaving(true)
    setSaveError(null)
    const res = await fetch('/api/investing/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(displayData)),
    })
    if (!res.ok) {
      const err = await res.json()
      setSaveError(err.error ?? 'Failed to add')
      setSaving(false)
      return
    }
    router.push('/investing/watchlist')
  }

  async function updateWatchlist() {
    if (!displayData || !ticker) return
    setSaving(true)
    setSaveError(null)
    const res = await fetch(`/api/investing/watchlist/${ticker}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sticker_price: stickerDisplay?.stickerPrice ?? null,
        mos_price: stickerDisplay?.mosPrice ?? null,
        growth_rate_used: effectiveRate,
        big5_data: {
          salesGrowth: displayData.salesGrowth,
          epsGrowth: displayData.epsGrowth,
          equityGrowth: displayData.equityGrowth,
          fcfGrowth: displayData.fcfGrowth,
          roic: displayData.roic,
          currentEps: displayData.currentEps,
          currentPrice: displayData.currentPrice,
          analystEstimate: displayData.analystGrowthRate,
        },
      }),
    })
    if (!res.ok) {
      const err = await res.json()
      setSaveError(err.error ?? 'Failed to update')
      setSaving(false)
      return
    }
    setDisplayData({ ...displayData, savedAt: new Date().toISOString() })
    setStatus('saved')
    setSaving(false)
  }

  async function saveChanges() {
    if (!displayData || !ticker) return
    setSaving(true)
    setSaveError(null)
    const updated = formToDisplayData(manualForm)
    const sticker = updated.currentEps && updated.currentEps > 0
      ? calcSticker(updated.currentEps, effectiveRate)
      : null
    const res = await fetch(`/api/investing/watchlist/${ticker}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sticker_price: sticker?.stickerPrice ?? null,
        mos_price: sticker?.mosPrice ?? null,
        growth_rate_used: effectiveRate,
        big5_data: {
          salesGrowth: updated.salesGrowth,
          epsGrowth: updated.epsGrowth,
          equityGrowth: updated.equityGrowth,
          fcfGrowth: updated.fcfGrowth,
          roic: updated.roic,
          currentEps: updated.currentEps,
          currentPrice: updated.currentPrice,
        },
      }),
    })
    if (!res.ok) {
      const err = await res.json()
      setSaveError(err.error ?? 'Failed to save')
      setSaving(false)
      return
    }
    setDisplayData({ ...updated, savedAt: displayData.savedAt })
    setIsEditing(false)
    setSaving(false)
  }

  const showResults = status === 'api-success' || status === 'api-refresh-success' || status === 'saved' || status === 'api-failure'

  return (
    <div className="calculator">
      <form onSubmit={handleSubmit} className="calculator__ticker-form">
        <div className="form-field" style={{ flex: 1 }}>
          <label htmlFor="ticker">Stock ticker</label>
          <input
            id="ticker"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL"
            maxLength={10}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={status === 'loading' || !input.trim()}>
          <Search size={15} /> {status === 'loading' ? 'Loading…' : 'Analyze'}
        </button>
      </form>

      {status === 'loading' && <Spinner />}

      {status === 'api-failure' && (
        <div className="calculator__warning">
          <AlertTriangle size={16} />
          <span>{apiError} Enter the values manually below.</span>
        </div>
      )}

      {status === 'saved' && displayData?.savedAt && (
        <div className="calculator__saved-banner">
          <span>
            Saved on {new Date(displayData.savedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          <div className="calculator__saved-banner-actions">
            {isEditing ? (
              <>
                <button className="btn-secondary btn-sm" onClick={() => setIsEditing(false)} disabled={saving}>
                  Cancel
                </button>
                <button
                  className="btn-primary btn-sm"
                  onClick={saveChanges}
                  disabled={saving || !manualForm.companyName.trim()}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setManualForm(displayDataToForm(displayData!))
                    setIsEditing(true)
                  }}
                >
                  <Pencil size={13} /> Edit
                </button>
                <button className="btn-secondary btn-sm" onClick={() => analyze(ticker, { skipDbCheck: true })}>
                  <RefreshCw size={13} /> Refresh from API
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {status === 'saved' && refreshError && (
        <div className="calculator__warning">
          <AlertTriangle size={16} />
          <span>API refresh failed: {refreshError} Your saved data is unchanged.</span>
        </div>
      )}

      {status === 'api-refresh-success' && (
        <div className="calculator__saved-banner">
          <span>Showing fresh data from API — not yet saved.</span>
        </div>
      )}

      {showResults && activeData && (
        <>
          <div className="calculator__header">
            <div>
              <h2 className="calculator__company">{activeData.companyName} ({ticker})</h2>
              {activeData.sector && <p className="calculator__sector">{activeData.sector}</p>}
            </div>
            <div className="calculator__price-info">
              <span className="stat-card__label">Current Price</span>
              {displayPrice !== null ? (
                <span className="calculator__price">
                  {displayPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  {livePrice !== null && <span className="calculator__price-live"> live</span>}
                </span>
              ) : priceFetchFailed ? (
                <div className="calculator__price-manual">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Enter price"
                    value={manualPriceInput}
                    onChange={(e) => setManualPriceInput(e.target.value)}
                    className="calculator__price-input"
                  />
                </div>
              ) : (
                <span className="calculator__price calculator__price--loading">—</span>
              )}
            </div>
          </div>

          {(status === 'api-failure' || isEditing) && (
            <ManualEntryForm form={manualForm} setField={setField} />
          )}

          <section>
            <h3 className="section-label">Big 5 Growth Numbers</h3>
            <Big5Table data={activeData} />
          </section>

          <section>
            <h3 className="section-label">Sticker Price &amp; Margin of Safety</h3>
            {currentEps === null || currentEps <= 0 ? (
              <p className="calculator__no-eps">
                {status === 'api-failure' ? 'Enter Current EPS above to calculate sticker price.' : 'EPS not available.'}
              </p>
            ) : (
              <>
                <div className="growth-override">
                  <label className="growth-override__label">
                    Growth rate used:
                    {activeData?.analystGrowthRate !== null && activeData?.analystGrowthRate !== undefined ? (
                      <span className="growth-override__default">
                        {' '}(min of analyst {(activeData.analystGrowthRate * 100).toFixed(1)}% &amp; 10yr EPS — Phil Town method)
                      </span>
                    ) : (
                      <span className="growth-override__default">
                        {' '}(10yr EPS growth)
                        <span
                          className="growth-override__info"
                          title="Enter an Analyst EPS Growth estimate in the form above to apply Phil Town's conservative min() method"
                        >
                          <Info size={13} />
                        </span>
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    className="growth-override__input"
                    value={growthOverride}
                    onChange={(e) => setGrowthOverride(e.target.value)}
                    placeholder={(baseGrowthRate * 100).toFixed(1)}
                    step="0.1"
                    min="0"
                    max="100"
                  />
                  <span className="growth-override__unit">%</span>
                  {growthOverride !== '' && (
                    <button className="btn-secondary btn-sm" onClick={() => setGrowthOverride('')}>Reset</button>
                  )}
                </div>
                {stickerDisplay && (
                  <StickerPricePanel
                    sticker={stickerDisplay}
                    currentPrice={displayPrice ?? undefined}
                    growthRate={effectiveRate}
                  />
                )}
              </>
            )}
          </section>

          {saveError && <ErrorMessage message={saveError} />}

          {isAdmin && status === 'api-success' && (
            <div className="form-actions__right">
              <button className="btn-primary" onClick={addToWatchlist} disabled={saving}>
                {saving ? 'Adding…' : '+ Add to Watchlist'}
              </button>
            </div>
          )}

          {isAdmin && status === 'api-refresh-success' && (
            <div className="form-actions__right">
              <button className="btn-secondary" onClick={() => analyze(ticker)}>
                Discard
              </button>
              <button className="btn-primary" onClick={updateWatchlist} disabled={saving}>
                {saving ? 'Updating…' : 'Update Watchlist'}
              </button>
            </div>
          )}

          {isAdmin && status === 'api-failure' && (
            <div className="form-actions__right">
              <button
                className="btn-primary"
                onClick={saveToWatchlist}
                disabled={saving || !manualForm.companyName.trim()}
              >
                {saving ? 'Saving…' : 'Save to Watchlist'}
              </button>
            </div>
          )}

        </>
      )}
    </div>
  )
}

function ManualEntryForm({
  form,
  setField,
}: {
  form: ManualForm
  setField: (key: keyof ManualForm, value: string) => void
}) {
  function rateInput(key: keyof ManualForm) {
    return (
      <input
        type="number"
        step="0.1"
        value={form[key]}
        onChange={(e) => setField(key, e.target.value)}
        className="manual-entry__rate-input"
        placeholder="—"
      />
    )
  }

  return (
    <section className="manual-entry">
      <h3 className="section-label">Enter Data Manually</h3>

      <div className="manual-entry__basics">
        <div className="form-field">
          <label>Company Name *</label>
          <input
            type="text"
            value={form.companyName}
            onChange={(e) => setField('companyName', e.target.value)}
            placeholder="e.g. Apple Inc."
          />
        </div>
        <div className="form-field">
          <label>Sector</label>
          <input
            type="text"
            value={form.sector}
            onChange={(e) => setField('sector', e.target.value)}
            placeholder="e.g. Technology"
          />
        </div>
        <div className="form-field">
          <label>Current EPS ($)</label>
          <input
            type="number"
            step="0.01"
            value={form.currentEps}
            onChange={(e) => setField('currentEps', e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="form-field">
          <label>Analyst EPS Growth Est. (%)</label>
          <input
            type="number"
            step="0.1"
            value={form.analystEstimate}
            onChange={(e) => setField('analystEstimate', e.target.value)}
            placeholder="e.g. 12.0"
          />
        </div>
      </div>

      <table className="big5-table manual-entry__rates">
        <thead>
          <tr>
            <th>Metric</th>
            <th>1 Year (%)</th>
            <th>5 Year (%)</th>
            <th>10 Year (%)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="big5-table__metric">Sales Growth</td>
            <td>{rateInput('salesY1')}</td>
            <td>{rateInput('salesY5')}</td>
            <td>{rateInput('salesY10')}</td>
          </tr>
          <tr>
            <td className="big5-table__metric">EPS Growth</td>
            <td>{rateInput('epsY1')}</td>
            <td>{rateInput('epsY5')}</td>
            <td>{rateInput('epsY10')}</td>
          </tr>
          <tr>
            <td className="big5-table__metric">Equity Growth</td>
            <td>{rateInput('equityY1')}</td>
            <td>{rateInput('equityY5')}</td>
            <td>{rateInput('equityY10')}</td>
          </tr>
          <tr>
            <td className="big5-table__metric">Free Cash Flow</td>
            <td>{rateInput('fcfY1')}</td>
            <td>{rateInput('fcfY5')}</td>
            <td>{rateInput('fcfY10')}</td>
          </tr>
          <tr>
            <td className="big5-table__metric">ROIC</td>
            <td>{rateInput('roicY1')}</td>
            <td>{rateInput('roicY5')}</td>
            <td>{rateInput('roicY10')}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
