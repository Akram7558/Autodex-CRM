'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Car,
  Activity,
  LogOut,
  Settings,
  Bell,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const navItems = [
  { href: '/dashboard',            label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/dashboard/leads',      label: 'Prospects',       icon: Users },
  { href: '/dashboard/vehicules',  label: 'Véhicules',       icon: Car },
  { href: '/dashboard/activites',  label: 'Activités',       icon: Activity },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [userName, setUserName] = useState('Utilisateur')
  const [userInitial, setUserInitial] = useState('U')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) {
        router.push('/')
        return
      }
      const email = data.user.email ?? ''
      const name  = email.split('@')[0].replace('.', ' ')
      const display = name.charAt(0).toUpperCase() + name.slice(1)
      setUserName(display)
      setUserInitial(display.charAt(0).toUpperCase())
    })
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  function activeLabel() {
    const item = navItems.find(
      (n) => n.href === pathname || (n.href !== '/dashboard' && pathname.startsWith(n.href))
    )
    return item?.label ?? 'Dari CRM'
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 bg-[#0f1117] border-r border-white/[0.06] flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30">
            <Car className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-none tracking-tight">Dari CRM</p>
            <p className="text-white/30 text-[10px] mt-0.5 leading-none">Automobile · Algérie</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 pt-4 pb-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon     = item.icon
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-white/45 hover:text-white/75 hover:bg-white/5'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-2 pb-3 border-t border-white/[0.06] pt-2 space-y-0.5">
          <Link
            href="/dashboard/parametres"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-white/45 hover:text-white/75 hover:bg-white/5 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Paramètres
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-white/45 hover:text-white/75 hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>

        {/* User pill */}
        <div className="mx-2 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/[0.08]">
          <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[10px] font-bold">{userInitial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-xs font-medium truncate">{userName}</p>
          </div>
          <ChevronDown className="w-3 h-3 text-white/30 flex-shrink-0" />
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between h-14 px-6 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">
              Dari CRM
            </span>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-semibold text-sm">{activeLabel()}</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
              <Bell className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">{userInitial}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
