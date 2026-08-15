'use client'

import { Landmark, CreditCard } from 'lucide-react'
import { Tooltip } from './Tooltip'

// The household's three payment accounts, shared by the ledger's Budget column and
// the debts table's "Paid With" column so both offer the same options and read the
// same way. null (no value) means N/A — no account, rendered as nothing.
export type BudgetAccount = 'bank' | 'chase_cc' | 'boa_cc'

export const BUDGET_ACCOUNTS: { value: BudgetAccount; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'chase_cc', label: 'Chase CC' },
  { value: 'boa_cc', label: 'BoA CC' },
]

// Read-view icon per account: Bank → landmark (neutral); Chase CC → credit card
// in Chase blue; BoA CC → credit card in Bank of America red (colors via CSS).
const BUDGET_ICON: Record<BudgetAccount, { Icon: typeof Landmark; cls: string; label: string }> = {
  bank: { Icon: Landmark, cls: 'budget-icon--bank', label: 'Bank' },
  chase_cc: { Icon: CreditCard, cls: 'budget-icon--chase', label: 'Chase CC' },
  boa_cc: { Icon: CreditCard, cls: 'budget-icon--boa', label: 'BoA CC' },
}

export const budgetAccountLabel = (account: BudgetAccount): string => BUDGET_ICON[account].label

// Settled-row icon for a payment account. `tooltip` defaults to the plain label —
// pass one when the column needs to explain what the account means there.
export function BudgetAccountIcon({ account, tooltip }: { account: BudgetAccount; tooltip?: string }) {
  const { Icon, cls, label } = BUDGET_ICON[account]
  return (
    <Tooltip text={tooltip ?? label}>
      <span className={`notes-icon ${cls}`}><Icon size={14} /></span>
    </Tooltip>
  )
}
