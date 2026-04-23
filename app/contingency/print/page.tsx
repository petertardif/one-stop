import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { PrintButton } from './PrintButton'

const CATEGORY_LABELS: Record<string, string> = {
  immediately: 'Immediately (first 48 hours)',
  first_week: 'First Week',
  first_month: 'First Month',
  ongoing: 'Ongoing',
}

const CATEGORY_ORDER = ['immediately', 'first_week', 'first_month', 'ongoing']

const VAULT_LABELS: Record<string, string> = {
  financial_accounts: 'Financial Accounts',
  insurance: 'Insurance Policies',
  retirement: 'Retirement Accounts',
  real_estate: 'Real Estate',
  legal: 'Legal Documents',
  advisors_contacts: 'Advisors & Contacts',
  digital_assets: 'Digital Assets',
  income: 'Income Sources',
}

interface ChecklistRow {
  id: string
  category: string
  sort_order: number
  title: string
  description: string | null
}

interface VaultRow {
  id: string
  category: string
  title: string
  fields: Record<string, string | null>
  last_verified_at: string | null
}

function fmtDate(iso: string | null) {
  if (!iso) return 'Not verified'
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default async function PrintPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [checklistRes, vaultRes] = await Promise.all([
    query<ChecklistRow>(
      'SELECT id, category, sort_order, title, description FROM checklist_items ORDER BY category, sort_order'
    ),
    query<VaultRow>(
      'SELECT id, category, title, fields, last_verified_at FROM vault_entries ORDER BY category, title'
    ),
  ])

  const checklistByCategory: Record<string, ChecklistRow[]> = {}
  for (const item of checklistRes.rows) {
    if (!checklistByCategory[item.category]) checklistByCategory[item.category] = []
    checklistByCategory[item.category].push(item)
  }

  const vaultByCategory: Record<string, VaultRow[]> = {}
  for (const entry of vaultRes.rows) {
    if (!vaultByCategory[entry.category]) vaultByCategory[entry.category] = []
    vaultByCategory[entry.category].push(entry)
  }

  const printDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <>
      <div className="print-toolbar">
        <p>Review this document before printing. Sensitive information is included.</p>
        <PrintButton />
      </div>

      <div className="print-document">
        <div className="print-doc-header">
          <h1>In Case I Die</h1>
          <p>A guide prepared for my family &mdash; printed {printDate}</p>
        </div>

        <h2>Checklist</h2>
        {CATEGORY_ORDER.map((cat) => {
          const items = checklistByCategory[cat]
          if (!items?.length) return null
          return (
            <div key={cat}>
              <h3>{CATEGORY_LABELS[cat]}</h3>
              <ul className="print-checklist">
                {items.map((item) => (
                  <li key={item.id}>
                    <span className="print-checkbox" />
                    <div>
                      <strong>{item.title}</strong>
                      {item.description && <p>{item.description}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

        <h2>Document Vault</h2>
        <p className="print-note">Passwords are not stored here. Refer to your password manager for login credentials.</p>
        {Object.entries(VAULT_LABELS).map(([slug, label]) => {
          const entries = vaultByCategory[slug]
          if (!entries?.length) return null
          return (
            <div key={slug}>
              <h3>{label}</h3>
              {entries.map((entry) => (
                <div key={entry.id} className="print-vault-entry">
                  <div className="print-vault-entry__header">
                    <span className="print-vault-entry__title">{entry.title}</span>
                    <span className="print-vault-entry__verified">Last verified: {fmtDate(entry.last_verified_at)}</span>
                  </div>
                  <dl>
                    {Object.entries(entry.fields ?? {}).map(([key, val]) => {
                      if (!val) return null
                      return (
                        <>
                          <dt key={`dt-${key}`}>{key.replace(/_/g, ' ')}</dt>
                          <dd key={`dd-${key}`}>{val}</dd>
                        </>
                      )
                    })}
                  </dl>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </>
  )
}
