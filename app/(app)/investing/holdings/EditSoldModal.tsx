'use client'

import { RefObject, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RecordModal, ModalField } from '@/components/RecordModal'
import { formatMoneyCents } from '@/lib/format'
import type { HoldingLot } from '@/lib/holdings'

const money2 = (v: string | null) => (v === null ? '' : parseFloat(v).toFixed(2))

/** Edit every field of a sold lot (purchase + sale). Ticker/company stay fixed. */
export function EditSoldModal({ dialogRef, lot }: { dialogRef: RefObject<HTMLDialogElement>; lot: HoldingLot | null }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    shares: '', price: '', fee: '', bought_on: '', sold_on: '', sale_price: '', sale_fee: '', notes: '',
  })

  useEffect(() => {
    if (!lot) return
    setForm({
      shares: String(parseFloat(lot.shares)),
      price: money2(lot.price),
      fee: money2(lot.fee),
      bought_on: lot.bought_on,
      sold_on: lot.sold_on ?? '',
      sale_price: money2(lot.sale_price),
      sale_fee: money2(lot.sale_fee),
      notes: lot.notes ?? '',
    })
  }, [lot])

  const save = useMutation({
    mutationFn: async () => {
      if (!lot) return
      const res = await fetch(`/api/investing/holdings/${lot.id}/sale`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: lot.ticker,
          company_name: lot.company_name,
          ...form,
          fee: form.fee || 0,
          sale_fee: form.sale_fee || 0,
          notes: form.notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown }
        throw new Error(typeof body.error === 'string' ? body.error : 'Could not save the lot')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holdings'] })
      dialogRef.current?.close()
    },
  })

  const canSave =
    parseFloat(form.shares) > 0 && form.price !== '' && form.sale_price !== '' &&
    form.bought_on !== '' && form.sold_on !== '' && form.sold_on >= form.bought_on

  const money = (key: 'price' | 'fee' | 'sale_price' | 'sale_fee') => (
    <input type="text" inputMode="numeric" placeholder="0.00" value={form[key]}
      onChange={(e) => setForm({ ...form, [key]: formatMoneyCents(e.target.value) })} />
  )

  return (
    <RecordModal
      dialogRef={dialogRef}
      title={lot ? `Edit sold ${lot.ticker} lot` : 'Edit sold lot'}
      onSave={() => save.mutate()}
      saving={save.isPending}
      canSave={canSave}
    >
      <ModalField label="Shares">
        <input type="number" min="0" step="any" value={form.shares}
          onChange={(e) => setForm({ ...form, shares: e.target.value })} />
      </ModalField>
      <ModalField label="Date bought">
        <input type="date" value={form.bought_on} onChange={(e) => setForm({ ...form, bought_on: e.target.value })} />
      </ModalField>
      <ModalField label="Buy price / share">{money('price')}</ModalField>
      <ModalField label="Purchase fee">{money('fee')}</ModalField>
      <ModalField label="Date sold">
        <input type="date" value={form.sold_on} onChange={(e) => setForm({ ...form, sold_on: e.target.value })} />
      </ModalField>
      <ModalField label="Sale price / share">{money('sale_price')}</ModalField>
      <ModalField label="Sale fee">{money('sale_fee')}</ModalField>
      <ModalField label="Notes" full>
        <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </ModalField>
      {form.sold_on !== '' && form.bought_on !== '' && form.sold_on < form.bought_on && (
        <p className="record-field--full negative">Date sold can&apos;t be before date bought.</p>
      )}
      {save.isError && <p className="record-field--full negative">{save.error.message}</p>}
    </RecordModal>
  )
}
