'use client'

import { signOut } from 'next-auth/react'
import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { LogOut, Settings, Camera } from 'lucide-react'

interface TopbarProps {
  firstName: string
  email: string
  avatarUrl: string | null
}

export function Topbar({ firstName, email, avatarUrl: initialAvatarUrl }: TopbarProps) {
  const [open, setOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const initials = firstName.slice(0, 1).toUpperCase()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)
    setOpen(false)

    const formData = new FormData()
    formData.append('avatar', file)

    const res = await fetch('/api/profile/avatar', { method: 'POST', body: formData })
    const data = await res.json()

    if (!res.ok) {
      setUploadError(data.error ?? 'Upload failed')
    } else {
      setAvatarUrl(`${data.avatarUrl}?t=${Date.now()}`)
    }
    setUploading(false)
    e.target.value = ''
  }, [])

  return (
    <header className="topbar">
      <div />

      {uploadError && (
        <p className="topbar__upload-error">{uploadError}</p>
      )}

      <div className="topbar__user" ref={dropdownRef} onClick={() => setOpen((o) => !o)}>
        <div className={`topbar__avatar-wrap${uploading ? ' topbar__avatar-wrap--uploading' : ''}`}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={firstName} className="topbar__avatar-img" />
          ) : (
            <div className="topbar__avatar">{initials}</div>
          )}
        </div>
        <span className="topbar__name">{firstName}</span>

        {open && (
          <div className="topbar__dropdown">
            <div className="topbar__dropdown-email">{email}</div>
            <button
              className="topbar__dropdown-item"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
            >
              <Camera size={14} />
              {uploading ? 'Uploading…' : 'Change photo'}
            </button>
            <Link href="/settings" className="topbar__dropdown-item" onClick={() => setOpen(false)}>
              <Settings size={14} />
              Settings
            </Link>
            <button
              className="topbar__dropdown-item"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="topbar__file-input"
        onChange={handleFileChange}
      />
    </header>
  )
}
