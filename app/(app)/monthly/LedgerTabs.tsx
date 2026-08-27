'use client'

import { useState } from 'react'
import { MonthlyLedger } from './MonthlyLedger'
import { Weekly1K } from './Weekly1K'

interface Account {
  id: string
  name: string
  institution: string | null
  type: string
}

type Tab = 'ledger' | 'weekly'

// Page shell for /monthly: the "Ledgers" heading and the two tabs. Ledger is the full
// transaction ledger (the original page); 1k Weekly narrows to one Fri->Thu week's
// $1,000 allowance. Tab state is local, matching /debts — the Budget page's
// /monthly?period=YYYY-MM deep link still lands on Ledger, the default.
export function LedgerTabs({
  accounts,
  initialPeriod,
  role,
}: {
  accounts: Account[]
  initialPeriod?: string
  role: string
}) {
  const [tab, setTab] = useState<Tab>('ledger')

  return (
    <div className="monthly-ledger">
      <div className="ledger-header">
        <h1>Ledgers</h1>
      </div>

      <div className="account-tabs debts-tabs">
        <button className={tab === 'ledger' ? 'active' : ''} onClick={() => setTab('ledger')}>Ledger</button>
        <button className={tab === 'weekly' ? 'active' : ''} onClick={() => setTab('weekly')}>1k Weekly</button>
      </div>

      {tab === 'ledger'
        ? <MonthlyLedger accounts={accounts} initialPeriod={initialPeriod} />
        : <Weekly1K role={role} />}
    </div>
  )
}
