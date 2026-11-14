'use client'

import { RefObject, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RecordModal, ModalField } from '@/components/RecordModal'
import { formatMoneyCents } from '@/lib/format'

export interface SellTarget {
  ticker: string
  shares: number
  /** Current price, used to pre-fill the sale price. */
  price: number | null
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function SellModal({ dialogRef, target }: { dialogRef: RefObject<HTMLDialogElement>; target: SellTarget | null }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ shares: '', price: '', sold_on: today() })

  useEffect(() => {
    if (!target) return
    setForm({
      shares: String(target.shares),
      price: target.price === null ? '' : target.price.toFixed(2),
      sold_on: today(),
    })
  }, [target])

  const sell = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/investing/holdings/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: target?.ticker, ...form }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown }
        throw new Error(typeof body.error === 'string' ? body.error : 'Could not record the sale')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings'] })
      dialogRef.current?.close()
    },
  })

  const shares = parseFloat(form.shares)
  const canSave = Boolean(target) && shares > 0 && shares <= (target?.shares ?? 0) && form.price !== '' && form.sold_on !== ''

  return (
    <RecordModal
      dialogRef={dialogRef}
      title={target ? `Sell ${target.ticker}` : 'Sell'}
      onSave={() => sell.mutate()}
      saving={sell.isPending}
      canSave={canSave}
    >
      <ModalField label={`Shares (of ${target?.shares.toLocaleString('en-US', { maximumFractionDigits: 6 }) ?? 0})`}>
        <input type="number" min="0" step="any" value={form.shares}
          onChange={(e) => setForm({ ...form, shares: e.target.value })} />
      </ModalField>
      <ModalField label="Sale price / share">
        <input type="text" inputMode="numeric" placeholder="0.00" value={form.price}
          onChange={(e) => setForm({ ...form, price: formatMoneyCents(e.target.value) })} />
      </ModalField>
      <ModalField label="Date sold">
        <input type="date" value={form.sold_on}
          onChange={(e) => setForm({ ...form, sold_on: e.target.value })} />
      </ModalField>
      <p className="record-field--full text-muted">Oldest lots are sold first; a partly sold lot is split.</p>
      {sell.isError && <p className="record-field--full negative">{sell.error.message}</p>}
    </RecordModal>
  )
}
