'use client'

import { useState } from 'react'

interface Props {
  initialSettings: {
    investing_access_partner: boolean
    investing_access_dependent: boolean
  }
}

export function AccessSection({ initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function toggle(key: keyof typeof settings) {
    const updated = { ...settings, [key]: !settings[key] }
    setSettings(updated)
    setSaving(true)
    setSaved(false)
    await fetch('/api/settings/access', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: updated[key] }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <section className="settings-section">
      <h2 className="settings-section__title">Section Access</h2>
      <p className="settings-section__desc">Control which sections Partner and Dependent users can view.</p>
      <div className="access-table">
        <div className="access-table__header">
          <span>Section</span>
          <span>Partner</span>
          <span>Dependent</span>
        </div>
        <div className="access-table__row">
          <span>Investing</span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.investing_access_partner}
              onChange={() => toggle('investing_access_partner')}
            />
            <span className="toggle__track" />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.investing_access_dependent}
              onChange={() => toggle('investing_access_dependent')}
            />
            <span className="toggle__track" />
          </label>
        </div>
      </div>
      {saving && <p className="settings-status">Saving…</p>}
      {saved && <p className="settings-status settings-status--saved">Saved</p>}
    </section>
  )
}
