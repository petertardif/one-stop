import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, Archive, Printer } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { query } from '@/lib/db'

export default async function ContingencyPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [checklistRes, vaultRes, progressRes] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*) FROM checklist_items'),
    query<{ count: string }>('SELECT COUNT(*) FROM vault_entries'),
    query<{ count: string }>(
      'SELECT COUNT(*) FROM checklist_progress WHERE user_id = $1 AND completed = true',
      [session.user.id]
    ),
  ])

  const totalItems = parseInt(checklistRes.rows[0]?.count ?? '0')
  const totalVault = parseInt(vaultRes.rows[0]?.count ?? '0')
  const completedItems = parseInt(progressRes.rows[0]?.count ?? '0')

  return (
    <div className="page-container page-container--wide">
      <h1 className="page-title">In Case I Die</h1>
      <p className="contingency-intro">
        A guide for your family to follow. Everything they need — in one place.
      </p>

      <div className="contingency-hub">
        <Link href="/contingency/checklist" className="contingency-card">
          <ClipboardList size={28} className="contingency-card__icon" />
          <div className="contingency-card__body">
            <h2>Checklist</h2>
            <p>Step-by-step tasks organized by timeline — what to do immediately, in the first week, and beyond.</p>
            <span className="contingency-card__stat">
              {totalItems === 0 ? 'No items yet' : `${completedItems} of ${totalItems} completed`}
            </span>
          </div>
        </Link>

        <Link href="/contingency/vault" className="contingency-card">
          <Archive size={28} className="contingency-card__icon" />
          <div className="contingency-card__body">
            <h2>Document Vault</h2>
            <p>Accounts, policies, legal documents, advisors, and everything else your family will need to find.</p>
            <span className="contingency-card__stat">
              {totalVault === 0 ? 'No entries yet' : `${totalVault} ${totalVault === 1 ? 'entry' : 'entries'}`}
            </span>
          </div>
        </Link>

        <Link href="/contingency/print" className="contingency-card">
          <Printer size={28} className="contingency-card__icon" />
          <div className="contingency-card__body">
            <h2>Print Guide</h2>
            <p>Generate a clean, printer-friendly version of the entire guide for a physical backup.</p>
            <span className="contingency-card__stat">Full guide · PDF-ready</span>
          </div>
        </Link>
      </div>
    </div>
  )
}
