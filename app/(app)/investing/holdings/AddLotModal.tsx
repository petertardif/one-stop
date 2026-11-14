'use client'

import { RefObject, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RecordModal, ModalField } from '@/components/RecordModal'
import { formatMoneyCents } from '@/lib/format'
import { TICKER_RE } from '@/lib/holdings'

export interface LotPrefill {
  ticker: string
  company_name: string
}

interface AddLotModalProps {
  dialogRef: RefObject<HTMLDialogElement>
  /** Set when opened from a Watchlist row: locks the ticker and removes it from the watchlist on save. */
  prefill?: LotPrefill | null
  onSaved?: (ticker: string) => void
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const empty = () => ({ ticker: '', company_name: '', shares: '', price: '', bought_on: today(), notes: '' })

export function AddLotModal({ dialogRef, prefill, onSaved }: AddLotModalProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(empty)
  const [lookupError, setLookupError] = useState<string | null>(null)

  // Reset each time the modal is (re)opened for a different stock.
  useEffect(() => {
    setForm({ ...empty(), ticker: prefill?.ticker ?? '', company_name: prefill?.company_name ?? '' })
    setLookupError(null)
  }, [prefill])

  async function lookupCompany() {
    const ticker = form.ticker.trim().toUpperCase()
    if (!TICKER_RE.test(ticker) || prefill) return
    const res = await fetch(`/api/investing/fmp/${ticker}?data=price`)
    if (!res.ok) { setLookupError(`No price found for ${ticker}`); return }
    const data = (await res.json()) as { companyName: string }
    setLookupError(null)
    setForm((f) => ({ ...f, ticker, company_name: data.companyName }))
  }

  const save = useMutation({
    mutationFn: async () => {
      const ticker = form.ticker.trim().toUpperCase()
      const res = await fetch('/api/investing/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          company_name: form.company_name.trim() || ticker,
          shares: form.shares,
          price: form.price,
          bought_on: form.bought_on,
          notes: form.notes.trim() || null,
          from_watchlist: Boolean(prefill),
        }),
      })
      if (!res.ok) throw new Error('Could not save lot')
      return ticker
    },
    onSuccess: (ticker) => {
      queryClient.invalidateQueries({ queryKey: ['holdings'] })
      dialogRef.current?.close()
      setForm(empty())
      onSaved?.(ticker)
    },
  })

  const canSave =
    TICKER_RE.test(form.ticker.trim().toUpperCase()) &&
    parseFloat(form.shares) > 0 &&
    form.price !== '' &&
    form.bought_on !== ''

  return (
    <RecordModal
      dialogRef={dialogRef}
      title={prefill ? `Bought ${prefill.ticker}` : 'Add lot'}
      onSave={() => save.mutate()}
      saving={save.isPending}
      canSave={canSave}
    >
      <ModalField label="Ticker">
        <input type="text" value={form.ticker} disabled={Boolean(prefill)} placeholder="AAPL"
          onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
          onBlur={lookupCompany} />
      </ModalField>
      <ModalField label="Company">
        <input type="text" value={form.company_name} disabled={Boolean(prefill)}
          onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
      </ModalField>
      <ModalField label="Shares">
        <input type="number" min="0" step="any" value={form.shares}
          onChange={(e) => setForm({ ...form, shares: e.target.value })} />
      </ModalField>
      <ModalField label="Price / share">
        <input type="text" inputMode="numeric" placeholder="0.00" value={form.price}
          onChange={(e) => setForm({ ...form, price: formatMoneyCents(e.target.value) })} />
      </ModalField>
      <ModalField label="Date bought">
        <input type="date" value={form.bought_on}
          onChange={(e) => setForm({ ...form, bought_on: e.target.value })} />
      </ModalField>
      <ModalField label="Notes" full>
        <input type="text" value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </ModalField>
      {lookupError && <p className="record-field--full text-muted">{lookupError}</p>}
      {save.isError && <p className="record-field--full negative">Could not save the lot.</p>}
    </RecordModal>
  )
}
