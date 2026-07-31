'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { useMobileNav } from '@/components/MobileNavContext'
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Heart,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

const DASHBOARD_ITEM: NavItem = {
  label: 'Dashboard',
  href: '/dashboard',
  icon: <LayoutDashboard size={18} />,
}

const CONTINGENCY_ITEM: NavItem = {
  label: 'Contingency Plan',
  href: '/contingency',
  icon: <Heart size={18} />,
}

const FINANCIALS_SUB_ITEMS = [
  { label: 'Ledger', href: '/monthly' },
  { label: 'Budget', href: '/budget' },
  { label: 'Debts', href: '/debts' },
  { label: 'Subscriptions', href: '/subscriptions' },
  { label: 'Auto', href: '/auto' },
  { label: 'Charitable Donations', href: '/donations' },
]

const INVESTING_SUB_ITEMS = [
  { label: 'Investments', href: '/investing/investments' },
  { label: 'Big 5 Calculator', href: '/investing/calculator' },
  { label: 'Watchlist', href: '/investing/watchlist' },
  { label: 'Too Hard Pile', href: '/investing/too-hard' },
]

interface SidebarProps {
  role: string
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNav()
  const [collapsed, setCollapsed] = useState(false)
  const isFinancialsActive = FINANCIALS_SUB_ITEMS.some(
    (s) => pathname === s.href || pathname.startsWith(s.href + '/')
  )
  const [financialsOpen, setFinancialsOpen] = useState(isFinancialsActive)
  const [investingOpen, setInvestingOpen] = useState(false)

  const contingencySubItems = [
    { label: 'In Case of Death', href: '/contingency/messages' },
    { label: 'Checklist', href: '/contingency/checklist' },
    { label: 'Document Vault', href: '/contingency/vault' },
  ]
  const isContingencyActive =
    pathname === CONTINGENCY_ITEM.href || pathname.startsWith(CONTINGENCY_ITEM.href + '/')
  const [contingencyOpen, setContingencyOpen] = useState(isContingencyActive)

  // Close the mobile drawer whenever navigation occurs.
  useEffect(() => { setMobileOpen(false) }, [pathname, setMobileOpen])

  // While the drawer is open: lock body scroll and close on Escape.
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [mobileOpen, setMobileOpen])

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}${mobileOpen ? ' sidebar--mobile-open' : ''}`}>
      <Link href="/dashboard" className="sidebar__header">
        <Image src="/logo-forest.svg" alt="One Stop" width={28} height={28} className="sidebar__logo-icon" />
        <span className="sidebar__logo-text">One Stop</span>
      </Link>

      <nav className="sidebar__nav">
        <ul>
          {/* Collapse toggle at top */}
          <li className="sidebar__collapse-item">
            <button
              className="sidebar__nav-item sidebar__collapse-btn"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand' : undefined}
            >
              <span className="sidebar__nav-icon">
                {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </span>
              <span className="sidebar__nav-label">Collapse</span>
            </button>
            <hr className="sidebar__divider" />
          </li>

          {/* Dashboard */}
          <li>
            <Link
              href={DASHBOARD_ITEM.href}
              className={`sidebar__nav-item${pathname === DASHBOARD_ITEM.href || pathname.startsWith(DASHBOARD_ITEM.href + '/') ? ' sidebar__nav-item--active' : ''}`}
              title={collapsed ? DASHBOARD_ITEM.label : undefined}
            >
              <span className="sidebar__nav-icon">{DASHBOARD_ITEM.icon}</span>
              <span className="sidebar__nav-label">{DASHBOARD_ITEM.label}</span>
            </Link>
          </li>

          {/* Financials with collapsible sub-menu */}
          <li>
            <div className="sidebar__nav-item sidebar__nav-item--expandable">
              <button
                className="sidebar__nav-item-main"
                onClick={() => setFinancialsOpen((o) => !o)}
                title={collapsed ? 'Financials' : undefined}
              >
                <span className="sidebar__nav-icon"><Wallet size={18} /></span>
                <span className="sidebar__nav-label">Financials</span>
              </button>
              <button
                className={`sidebar__nav-caret${financialsOpen ? ' sidebar__nav-caret--open' : ''}`}
                onClick={() => setFinancialsOpen((o) => !o)}
                aria-label={financialsOpen ? 'Collapse financials menu' : 'Expand financials menu'}
              >
                <ChevronDown size={14} />
              </button>
            </div>

            {financialsOpen && !collapsed && (
              <ul className="sidebar__sub-nav">
                {FINANCIALS_SUB_ITEMS.map((sub) => (
                  <li key={sub.href}>
                    <Link
                      href={sub.href}
                      className={`sidebar__sub-item${pathname === sub.href ? ' sidebar__sub-item--active' : ''}`}
                    >
                      {sub.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>

          {/* Investing with collapsible sub-menu */}
          <li>
            <div className={`sidebar__nav-item sidebar__nav-item--expandable${pathname === '/investing' ? ' sidebar__nav-item--active' : ''}`}>
              <Link
                href="/investing"
                className="sidebar__nav-item-main"
                title={collapsed ? 'Investing' : undefined}
              >
                <span className="sidebar__nav-icon"><TrendingUp size={18} /></span>
                <span className="sidebar__nav-label">Investing</span>
              </Link>
              <button
                className={`sidebar__nav-caret${investingOpen ? ' sidebar__nav-caret--open' : ''}`}
                onClick={() => setInvestingOpen((o) => !o)}
                aria-label={investingOpen ? 'Collapse investing menu' : 'Expand investing menu'}
              >
                <ChevronDown size={14} />
              </button>
            </div>

            {investingOpen && !collapsed && (
              <ul className="sidebar__sub-nav">
                {INVESTING_SUB_ITEMS.map((sub) => (
                  <li key={sub.href}>
                    <Link
                      href={sub.href}
                      className={`sidebar__sub-item${pathname === sub.href ? ' sidebar__sub-item--active' : ''}`}
                    >
                      {sub.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>

          {/* In Case I Die with collapsible sub-menu (pinned last) */}
          <li>
            <div className={`sidebar__nav-item sidebar__nav-item--expandable${pathname === CONTINGENCY_ITEM.href ? ' sidebar__nav-item--active' : ''}`}>
              <Link
                href={CONTINGENCY_ITEM.href}
                className="sidebar__nav-item-main"
                title={collapsed ? CONTINGENCY_ITEM.label : undefined}
              >
                <span className="sidebar__nav-icon">{CONTINGENCY_ITEM.icon}</span>
                <span className="sidebar__nav-label">{CONTINGENCY_ITEM.label}</span>
              </Link>
              <button
                className={`sidebar__nav-caret${contingencyOpen ? ' sidebar__nav-caret--open' : ''}`}
                onClick={() => setContingencyOpen((o) => !o)}
                aria-label={contingencyOpen ? 'Collapse In Case I Die menu' : 'Expand In Case I Die menu'}
              >
                <ChevronDown size={14} />
              </button>
            </div>

            {contingencyOpen && !collapsed && (
              <ul className="sidebar__sub-nav">
                {contingencySubItems.map((sub) => (
                  <li key={sub.href}>
                    <Link
                      href={sub.href}
                      className={`sidebar__sub-item${pathname === sub.href ? ' sidebar__sub-item--active' : ''}`}
                    >
                      {sub.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        </ul>
      </nav>

      {/* Settings pinned to bottom */}
      {role === 'admin' && (
        <div className="sidebar__footer">
          <Link
            href="/settings"
            className={`sidebar__nav-item${pathname.startsWith('/settings') ? ' sidebar__nav-item--active' : ''}`}
            title={collapsed ? 'Settings' : undefined}
          >
            <span className="sidebar__nav-icon"><Settings size={18} /></span>
            <span className="sidebar__nav-label">Settings</span>
          </Link>
        </div>
      )}
    </aside>
    </>
  )
}
