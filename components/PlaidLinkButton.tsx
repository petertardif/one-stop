'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePlaidLink, PlaidLinkOnSuccessMetadata } from 'react-plaid-link'
import { useQueryClient } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'

interface InnerProps {
  token: string
  onDone: () => void
}

function PlaidLinkInner({ token, onDone }: InnerProps) {
  const queryClient = useQueryClient()

  const onSuccess = useCallback(async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
    await fetch('/api/plaid/exchange-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        public_token: publicToken,
        institution_name: metadata.institution?.name ?? null,
      }),
    })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    onDone()
  }, [queryClient, onDone])

  const onExit = useCallback(() => onDone(), [onDone])

  const { open, ready } = usePlaidLink({ token, onSuccess, onExit })

  useEffect(() => {
    if (ready) open()
  }, [ready, open])

  return null
}

interface Props {
  className?: string
}

export function PlaidLinkButton({ className = 'btn-sm btn-secondary' }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openLink() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/plaid/link-token', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to create link token')
      const { link_token } = await res.json()
      setLinkToken(link_token)
    } catch {
      setError('Could not connect to Plaid. Check your configuration.')
      setLoading(false)
    }
  }

  function handleDone() {
    setLinkToken(null)
    setLoading(false)
  }

  return (
    <div>
      {linkToken && <PlaidLinkInner token={linkToken} onDone={handleDone} />}
      <button className={className} onClick={openLink} disabled={loading}>
        <Link2 size={14} />
        {loading ? 'Connecting…' : 'Connect Bank'}
      </button>
      {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: 4 }}>{error}</p>}
    </div>
  )
}
