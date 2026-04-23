import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'
import { VaultCategoryClient, type FieldDef, type VaultEntry } from './VaultCategoryClient'

const CATEGORY_META: Record<string, { label: string; fields: FieldDef[] }> = {
  financial_accounts: {
    label: 'Financial Accounts',
    fields: [
      { key: 'institution', label: 'Institution' },
      { key: 'account_type', label: 'Account type' },
      { key: 'account_number_hint', label: 'Account number (last 4)' },
      { key: 'login_url', label: 'Login URL' },
      { key: 'username_hint', label: 'Username hint' },
      { key: 'how_to_access', label: 'How to access' },
    ],
  },
  insurance: {
    label: 'Insurance Policies',
    fields: [
      { key: 'type', label: 'Type' },
      { key: 'carrier', label: 'Carrier' },
      { key: 'policy_number', label: 'Policy number' },
      { key: 'death_benefit', label: 'Death benefit' },
      { key: 'contact_phone', label: 'Contact phone' },
      { key: 'agent_name', label: 'Agent name' },
      { key: 'agent_phone', label: 'Agent phone' },
    ],
  },
  retirement: {
    label: 'Retirement Accounts',
    fields: [
      { key: 'account_type', label: 'Account type' },
      { key: 'institution', label: 'Institution' },
      { key: 'beneficiary', label: 'Beneficiary designation' },
      { key: 'how_to_access', label: 'How to access' },
    ],
  },
  real_estate: {
    label: 'Real Estate',
    fields: [
      { key: 'address', label: 'Property address' },
      { key: 'mortgage_lender', label: 'Mortgage lender' },
      { key: 'deed_location', label: 'Deed location' },
      { key: 'property_tax_info', label: 'Property tax info' },
    ],
  },
  legal: {
    label: 'Legal Documents',
    fields: [
      { key: 'will_location', label: 'Will location' },
      { key: 'trust_name', label: 'Trust name' },
      { key: 'trustee', label: 'Trustee' },
      { key: 'power_of_attorney', label: 'Power of attorney' },
      { key: 'healthcare_directive', label: 'Healthcare directive' },
    ],
  },
  advisors_contacts: {
    label: 'Advisors & Contacts',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'role', label: 'Role' },
      { key: 'firm', label: 'Firm' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'notes', label: 'Notes' },
    ],
  },
  digital_assets: {
    label: 'Digital Assets',
    fields: [
      { key: 'service', label: 'Service' },
      { key: 'username', label: 'Username' },
      { key: 'how_to_access', label: 'How to access' },
    ],
  },
  income: {
    label: 'Income Sources',
    fields: [
      { key: 'employer', label: 'Employer' },
      { key: 'hr_contact', label: 'HR contact' },
      { key: 'pension_info', label: 'Pension / benefits info' },
      { key: 'how_to_access_paystubs', label: 'How to access pay stubs' },
    ],
  },
}

interface Props {
  params: { category: string }
}

export default async function VaultCategoryPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const meta = CATEGORY_META[params.category]
  if (!meta) notFound()

  const result = await query<VaultEntry>(
    `SELECT id, category, title, fields, last_verified_at, created_at, updated_at
     FROM vault_entries WHERE category = $1 ORDER BY title`,
    [params.category]
  )

  return (
    <VaultCategoryClient
      initialEntries={result.rows}
      categoryLabel={meta.label}
      categorySlug={params.category}
      fieldDefs={meta.fields}
      isAdmin={session.user.role === 'admin'}
    />
  )
}
