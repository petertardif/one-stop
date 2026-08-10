'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, RotateCcw } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { RecordModal, ModalField } from '@/components/RecordModal'
import type { Recipient, Parent } from './page'

const REQUIRED_PHRASE = 'I understand this decision is irreversible.'

type Kind = 'main' | 'letter' | 'video' | 'audio' | 'gallery' | 'open_when'
type ReleaseMode = 'immediate' | 'offset' | 'date' | 'milestone' | 'recurring_annual'

interface GoodbyeImage { id?: string; image_url: string; caption: string | null }
interface GoodbyeMessage {
  id: string
  kind: Kind
  audience_role: string | null
  audience_user_id: string | null
  title: string | null
  body: string | null
  media_url: string | null
  release_mode: ReleaseMode
  offset_amount: number | null
  offset_unit: string | null
  release_date: string | null
  milestone_label: string | null
  images: GoodbyeImage[]
}

const KIND_LABEL: Record<Kind, string> = {
  main: 'Main message', letter: 'Letter', video: 'Video', audio: 'Audio',
  gallery: 'Photo gallery', open_when: '“Open when…” letter',
}
const ROLE_AUDIENCE_LABEL: Record<string, string> = {
  everyone: 'Everyone', partner: 'All Partners', dependent: 'All Dependents', partner_admin: 'Partner Admins',
}

interface FormState {
  id: string | null
  audience: string // 'role:everyone' | 'role:dependent' | 'user:<id>'
  kind: Kind
  title: string
  body: string
  media_url: string
  release_mode: ReleaseMode
  offset_amount: string
  offset_unit: 'days' | 'months' | 'years'
  release_date: string
  milestone_label: string
  images: { image_url: string; caption: string }[]
}

const EMPTY_FORM: FormState = {
  id: null, audience: 'role:everyone', kind: 'letter', title: '', body: '', media_url: '',
  release_mode: 'immediate', offset_amount: '', offset_unit: 'years', release_date: '',
  milestone_label: '', images: [],
}

export type MessagesTab = 'confirm' | 'messages'

interface Props {
  isAuthor: boolean
  initialTab: MessagesTab
  parents: Parent[]
  diedAt: string | null
  deliveredName: string
  waitingCount: number
  recipients: Recipient[]
}

export function MessagesClient({ isAuthor, initialTab, parents, diedAt, deliveredName, waitingCount, recipients }: Props) {
  if (isAuthor) {
    return (
      <AuthorView
        initialTab={initialTab}
        parents={parents}
        diedAt={diedAt}
        deliveredName={deliveredName}
        recipients={recipients}
      />
    )
  }
  return <RecipientView parents={parents} diedAt={diedAt} deliveredName={deliveredName} waitingCount={waitingCount} />
}

// Shared so the card (recipients) and the page lead (authors) can never drift apart.
const GATE_LEAD = 'When a parent passes away there will be individual messages left here for you.'

// died_at is a timestamptz; show the date only -- the exact minute adds nothing here.
function formatConfirmedAt(diedAt: string): string {
  const d = new Date(diedAt)
  return Number.isNaN(d.getTime())
    ? diedAt
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ── The death gate: parent-neutral Yes/No + a who-died picker + type-to-confirm ──
function DeathGate({
  parents,
  redirectOnCancel,
  // Authors render this copy above the card as the page lead, so the card omits it there.
  // Recipients keep it inside the card, which is their whole view.
  showLead = true,
}: {
  parents: Parent[]
  redirectOnCancel?: boolean
  showLead?: boolean
}) {
  const router = useRouter()
  const confirmRef = useRef<HTMLDialogElement>(null)
  const [saidNo, setSaidNo] = useState(false)
  const [pick, setPick] = useState('')
  const [phrase, setPhrase] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const options = [
    ...parents.map((p) => ({ value: p.id, label: p.name })),
    ...(parents.length === 2 ? [{ value: 'both', label: 'Both' }] : []),
  ]

  const openConfirm = () => {
    setPhrase('')
    setPick(parents.length === 1 ? parents[0].id : '')
    confirmRef.current?.showModal()
  }

  const deceasedIds = pick === 'both' ? parents.map((p) => p.id) : pick ? [pick] : []
  const canConfirm = deceasedIds.length > 0 && phrase.trim() === REQUIRED_PHRASE && !submitting

  const confirmDeath = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/contingency/goodbyes/confirm-death', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deceased_ids: deceasedIds }),
      })
      if (!res.ok) throw new Error('Failed to confirm')
      confirmRef.current?.close()
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  const cancelBack = () => {
    confirmRef.current?.close()
    if (redirectOnCancel) router.push('/contingency')
  }

  return (
    <div className="goodbyes-gate">
      {showLead && <p className="goodbyes-gate__lead">{GATE_LEAD}</p>}
      <h2 className="goodbyes-gate__question">Has a parent passed away?</h2>
      <div className="goodbyes-gate__buttons">
        <button className="goodbyes-gate__btn goodbyes-gate__btn--yes" onClick={openConfirm}>Yes</button>
        <button className="goodbyes-gate__btn goodbyes-gate__btn--no" onClick={() => setSaidNo(true)}>No</button>
      </div>
      {saidNo && (
        <p className="goodbyes-gate__comfort">
          When the time comes where you will select yes to that question, come back for some comfort.
          Until then go live your life and enjoy every minute of it.
        </p>
      )}

      <dialog ref={confirmRef} className="confirm-dialog goodbyes-confirm">
        <p>
          Please be sure before continuing — the messages will be delivered now and this decision is
          irreversible.
        </p>
        <label className="goodbyes-confirm__label">Who has passed away?</label>
        <select
          className="goodbyes-confirm__input"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="" disabled>Select…</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label className="goodbyes-confirm__label">
          Type <strong>{REQUIRED_PHRASE}</strong> to continue.
        </label>
        <input
          className="goodbyes-confirm__input"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={REQUIRED_PHRASE}
          autoComplete="off"
        />
        <div className="dialog-actions">
          <button className="primary" disabled={!canConfirm} onClick={confirmDeath}>
            {submitting ? 'Confirming…' : 'Confirm Decision'}
          </button>
          <button className="danger" onClick={cancelBack}>Cancel and go back</button>
        </div>
      </dialog>
    </div>
  )
}

// ── Author view: manage the shared set of messages (admin + partner_admin) ──
function AuthorView({ initialTab, parents, diedAt, deliveredName, recipients }: { initialTab: MessagesTab; parents: Parent[]; diedAt: string | null; deliveredName: string; recipients: Recipient[] }) {
  const router = useRouter()
  const qc = useQueryClient()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [tab, setTab] = useState<MessagesTab>(initialTab)

  // Mirror the tab into the URL so refresh and browser-back both restore it. push (not
  // replace) is what creates the history entry that makes back work; the bare path for
  // Confirm keeps the sidebar link's own URL canonical.
  const changeTab = (next: MessagesTab) => {
    setTab(next)
    router.push(
      next === 'messages' ? '/contingency/messages?tab=messages' : '/contingency/messages',
      { scroll: false }
    )
  }

  const recipientName = (r: Recipient) => (r.first_name?.trim() || r.role)
  const audienceLabel = (m: GoodbyeMessage) => {
    if (m.audience_user_id) {
      const r = recipients.find((x) => x.id === m.audience_user_id)
      return r ? recipientName(r) : 'A specific person'
    }
    return ROLE_AUDIENCE_LABEL[m.audience_role ?? ''] ?? 'Everyone'
  }
  const releaseLabel = (m: GoodbyeMessage) => {
    switch (m.release_mode) {
      case 'immediate': return 'Immediately'
      case 'offset': return `${m.offset_amount ?? ''} ${m.offset_unit ?? ''} after death`
      case 'date': return `On ${m.release_date ?? '—'}`
      case 'milestone': return `Open when: ${m.milestone_label ?? '—'}`
      case 'recurring_annual': return `Every year on ${m.release_date ? m.release_date.slice(5) : '—'}`
    }
  }

  const { data, isLoading } = useQuery<{ messages: GoodbyeMessage[] }>({
    queryKey: ['goodbye-messages'],
    queryFn: async () => {
      const res = await fetch('/api/contingency/goodbyes/messages')
      if (!res.ok) throw new Error('Failed to load messages')
      return res.json()
    },
  })
  const messages = data?.messages ?? []

  const buildPayload = () => {
    const [aType, aVal] = form.audience.split(':')
    const isUser = aType === 'user'
    const kind = form.kind
    const releaseMode: ReleaseMode = kind === 'open_when' ? 'milestone' : form.release_mode
    return {
      kind,
      audience_role: isUser ? null : aVal,
      audience_user_id: isUser ? aVal : null,
      title: form.title.trim() || null,
      body: form.body.trim() || null,
      media_url: form.media_url.trim() || null,
      release_mode: releaseMode,
      offset_amount: releaseMode === 'offset' && form.offset_amount ? parseInt(form.offset_amount, 10) : null,
      offset_unit: releaseMode === 'offset' ? form.offset_unit : null,
      release_date: (releaseMode === 'date' || releaseMode === 'recurring_annual') && form.release_date ? form.release_date : null,
      milestone_label: kind === 'open_when' ? form.milestone_label.trim() || null : null,
      images: kind === 'gallery' ? form.images.filter((i) => i.image_url.trim()).map((i) => ({ image_url: i.image_url.trim(), caption: i.caption.trim() || null })) : [],
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload()
      const url = form.id ? `/api/contingency/goodbyes/messages/${form.id}` : '/api/contingency/goodbyes/messages'
      const res = await fetch(url, {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save message')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goodbye-messages'] })
      dialogRef.current?.close()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/contingency/goodbyes/messages/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete message')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goodbye-messages'] }),
  })

  const openNew = () => { setForm(EMPTY_FORM); dialogRef.current?.showModal() }
  const openEdit = (m: GoodbyeMessage) => {
    setForm({
      id: m.id,
      audience: m.audience_user_id ? `user:${m.audience_user_id}` : `role:${m.audience_role}`,
      kind: m.kind,
      title: m.title ?? '',
      body: m.body ?? '',
      media_url: m.media_url ?? '',
      release_mode: m.release_mode === 'milestone' ? 'immediate' : m.release_mode,
      offset_amount: m.offset_amount != null ? String(m.offset_amount) : '',
      offset_unit: (m.offset_unit as FormState['offset_unit']) ?? 'years',
      release_date: m.release_date ?? '',
      milestone_label: m.milestone_label ?? '',
      images: m.images.map((i) => ({ image_url: i.image_url, caption: i.caption ?? '' })),
    })
    dialogRef.current?.showModal()
  }

  const resetDeath = async () => {
    if (!confirm('Reset the death status? This returns everyone to the "has passed away?" gate.')) return
    const res = await fetch('/api/contingency/goodbyes/reset-death', { method: 'POST' })
    if (res.ok) router.refresh()
  }

  const canSave = form.audience !== '' &&
    (form.kind === 'gallery' ? form.images.some((i) => i.image_url.trim()) : true) &&
    (form.kind === 'open_when' ? form.milestone_label.trim() !== '' : true)

  const showBody = form.kind === 'main' || form.kind === 'letter' || form.kind === 'open_when'
  const showMedia = form.kind === 'main' || form.kind === 'video' || form.kind === 'audio'

  return (
    <div className="goodbyes goodbyes--wide">
      <div className="goodbyes-manage__header">
        <div>
          <h1>{tab === 'confirm' ? 'Confirmation' : 'Messages'}</h1>
        </div>
        <div className="ledger-actions">
          {tab === 'messages' && (
            <button className="primary" onClick={openNew}><Plus size={14} /> New message</button>
          )}
          {tab === 'confirm' && diedAt && (
            <button className="danger" onClick={resetDeath}><RotateCcw size={14} /> Reset death status</button>
          )}
        </div>
      </div>

      {tab === 'confirm' ? (
        <p className="goodbyes-lead">{GATE_LEAD}</p>
      ) : diedAt ? (
        <p className="goodbyes-lead">
          The death gate has been confirmed for {deliveredName} — these messages are now being delivered.
          Video/audio/photos are links you paste (e.g. an unlisted YouTube/Vimeo/Drive URL).
        </p>
      ) : (
        <p className="goodbyes-lead">
          Messages stay hidden until someone confirms the death gate. Video/audio/photos are links you
          paste (e.g. an unlisted YouTube/Vimeo/Drive URL).
        </p>
      )}

      <div className="account-tabs goodbyes-tabs">
        <button className={tab === 'confirm' ? 'active' : ''} onClick={() => changeTab('confirm')}>Confirm</button>
        <button className={tab === 'messages' ? 'active' : ''} onClick={() => changeTab('messages')}>Messages</button>
      </div>

      {tab === 'confirm' && (
        diedAt ? (
          <div className="goodbyes-confirmed">
            <p className="goodbyes-confirmed__title">Confirmed for {deliveredName}</p>
            <p className="goodbyes-confirmed__note">
              Recorded {formatConfirmedAt(diedAt)}. Messages authored by {deliveredName} are now being
              delivered. Use Reset death status above to return everyone to the question.
            </p>
          </div>
        ) : (
          <DeathGate parents={parents} showLead={false} />
        )
      )}

      {tab === 'messages' && (
        <>
          {isLoading && <Spinner />}

          {!isLoading && messages.length === 0 && (
            <p className="dashboard__empty">No messages yet. Add the first one.</p>
          )}

          {!isLoading && messages.length > 0 && (
            <div className="ledger-table-wrap">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>For</th><th>Type</th><th>Title</th><th>Release</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m) => (
                    <tr key={m.id}>
                      <td>{audienceLabel(m)}</td>
                      <td>{KIND_LABEL[m.kind]}</td>
                      <td>{m.title || <span className="text-muted">—</span>}</td>
                      <td>{releaseLabel(m)}</td>
                      <td className="col-center">
                        <button className="icon-btn icon-btn--edit" onClick={() => openEdit(m)} aria-label="Edit"><Pencil size={16} /></button>
                        <button className="icon-btn icon-btn--delete" onClick={() => { if (confirm('Delete this message?')) deleteMutation.mutate(m.id) }} aria-label="Delete"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <RecordModal
        dialogRef={dialogRef}
        title={form.id ? 'Edit message' : 'New message'}
        onSave={() => saveMutation.mutate()}
        saving={saveMutation.isPending}
        canSave={canSave}
      >
        <ModalField label="For">
          <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
            <option value="role:everyone">Everyone</option>
            <option value="role:dependent">All Dependents</option>
            {recipients.map((r) => (
              <option key={r.id} value={`user:${r.id}`}>{recipientName(r)}</option>
            ))}
          </select>
        </ModalField>

        <ModalField label="Type">
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </ModalField>

        <ModalField label="Title" full>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Optional title" />
        </ModalField>

        {showBody && (
          <ModalField label={form.kind === 'open_when' ? 'Letter' : 'Message'} full>
            <textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write your message…" />
          </ModalField>
        )}

        {showMedia && (
          <ModalField label={form.kind === 'audio' ? 'Audio link' : 'Video link'} full>
            <input value={form.media_url} onChange={(e) => setForm({ ...form, media_url: e.target.value })} placeholder="https://… (unlisted link)" />
          </ModalField>
        )}

        {form.kind === 'gallery' && (
          <div className="record-field record-field--full">
            <span>Photos (image links)</span>
            {form.images.map((img, i) => (
              <div key={i} className="goodbyes-image-row">
                <input value={img.image_url} placeholder="Image URL" onChange={(e) => {
                  const images = [...form.images]; images[i] = { ...images[i], image_url: e.target.value }; setForm({ ...form, images })
                }} />
                <input value={img.caption} placeholder="Caption" onChange={(e) => {
                  const images = [...form.images]; images[i] = { ...images[i], caption: e.target.value }; setForm({ ...form, images })
                }} />
                <button className="icon-btn icon-btn--delete" aria-label="Remove" onClick={() => setForm({ ...form, images: form.images.filter((_, j) => j !== i) })}><X size={16} /></button>
              </div>
            ))}
            <button className="goodbyes-add-image" onClick={() => setForm({ ...form, images: [...form.images, { image_url: '', caption: '' }] })}><Plus size={14} /> Add photo</button>
          </div>
        )}

        {form.kind === 'open_when' ? (
          <ModalField label="Open when…" full>
            <input value={form.milestone_label} onChange={(e) => setForm({ ...form, milestone_label: e.target.value })} placeholder="e.g. you get married, you feel lost, your first child" />
          </ModalField>
        ) : (
          <ModalField label="Release">
            <select value={form.release_mode} onChange={(e) => setForm({ ...form, release_mode: e.target.value as ReleaseMode })}>
              <option value="immediate">Immediately on death</option>
              <option value="offset">Specific time after death</option>
              <option value="date">On a specific date</option>
              <option value="recurring_annual">Every year (annual)</option>
            </select>
          </ModalField>
        )}

        {form.kind !== 'open_when' && form.release_mode === 'offset' && (
          <ModalField label="How long after">
            <div className="goodbyes-offset">
              <input type="number" min="1" value={form.offset_amount} onChange={(e) => setForm({ ...form, offset_amount: e.target.value })} placeholder="1" />
              <select value={form.offset_unit} onChange={(e) => setForm({ ...form, offset_unit: e.target.value as FormState['offset_unit'] })}>
                <option value="days">days</option>
                <option value="months">months</option>
                <option value="years">years</option>
              </select>
            </div>
          </ModalField>
        )}

        {form.kind !== 'open_when' && (form.release_mode === 'date' || form.release_mode === 'recurring_annual') && (
          <ModalField label={form.release_mode === 'recurring_annual' ? 'Annual date' : 'Release date'}>
            <input type="date" value={form.release_date} onChange={(e) => setForm({ ...form, release_date: e.target.value })} />
          </ModalField>
        )}
      </RecordModal>
    </div>
  )
}

// ── Recipient view: the death gate before death, delivery stub after ──
function RecipientView({ parents, diedAt, deliveredName, waitingCount }: { parents: Parent[]; diedAt: string | null; deliveredName: string; waitingCount: number }) {
  if (diedAt) {
    return (
      <div className="goodbyes">
        <h1>Messages from {deliveredName}</h1>
        <div className="goodbyes-delivery">
          <p className="goodbyes-delivery__lead">
            {waitingCount > 0
              ? `${waitingCount} message${waitingCount === 1 ? '' : 's'} ${waitingCount === 1 ? 'is' : 'are'} waiting for you.`
              : `${deliveredName} left messages here for the people they love.`}
          </p>
          <p className="goodbyes-delivery__note">
            The full experience — the main message, letters, videos and more — is being prepared and will appear here soon.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="goodbyes">
      <DeathGate parents={parents} redirectOnCancel />
    </div>
  )
}
