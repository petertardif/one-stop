'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import {
  LayoutDashboard,
  Receipt,
  TrendingUp,
  Heart,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={18} /> },
  { label: 'Monthly Budget', href: '/monthly', icon: <Receipt size={18} /> },
  { label: 'Investing', href: '/investing', icon: <TrendingUp size={18} /> },
  { label: 'In Case I Die', href: '/contingency', icon: <Heart size={18} /> },
]

interface SidebarProps {
  role: string
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
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

          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`sidebar__nav-item${isActive ? ' sidebar__nav-item--active' : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="sidebar__nav-icon">{item.icon}</span>
                  <span className="sidebar__nav-label">{item.label}</span>
                </Link>
              </li>
            )
          })}
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
  )
}
