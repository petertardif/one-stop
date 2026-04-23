import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  CreditCard, Shield, Briefcase, Home, FileText, Users, Globe, DollarSign,
} from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

const CATEGORIES = [
  { slug: 'financial_accounts', label: 'Financial Accounts', icon: CreditCard },
  { slug: 'insurance', label: 'Insurance Policies', icon: Shield },
  { slug: 'retirement', label: 'Retirement Accounts', icon: Briefcase },
  { slug: 'real_estate', label: 'Real Estate', icon: Home },
  { slug: 'legal', label: 'Legal Documents', icon: FileText },
  { slug: 'advisors_contacts', label: 'Advisors & Contacts', icon: Users },
  { slug: 'digital_assets', label: 'Digital Assets', icon: Globe },
  { slug: 'income', label: 'Income Sources', icon: DollarSign },
]

export default async function VaultPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const result = await query<{ category: string; count: string; last_verified_at: string | null }>(
    `SELECT category, COUNT(*) AS count, MAX(last_verified_at) AS last_verified_at
     FROM vault_entries GROUP BY category`
  )

  const countMap: Record<string, { count: number; lastVerified: string | null }> = {}
  for (const row of result.rows) {
    countMap[row.category] = { count: parseInt(row.count), lastVerified: row.last_verified_at }
  }

  return (
    <div className="page-container page-container--wide">
      <h1 className="page-title">Document Vault</h1>
      <p className="contingency-intro">
        Critical information your family will need. Never store passwords here — use a password manager (1Password, Bitwarden, etc.).
      </p>

      <div className="vault-grid">
        {CATEGORIES.map(({ slug, label, icon: Icon }) => {
          const info = countMap[slug]
          return (
            <Link key={slug} href={`/contingency/vault/${slug}`} className="vault-card">
              <Icon size={22} className="vault-card__icon" />
              <div className="vault-card__body">
                <h2>{label}</h2>
                <span className="vault-card__count">
                  {info ? `${info.count} ${info.count === 1 ? 'entry' : 'entries'}` : 'No entries yet'}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
