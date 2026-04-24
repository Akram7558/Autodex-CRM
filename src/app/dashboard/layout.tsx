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
  MoreVertical,
  Kanban,
  BellRing,
  Plug,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { NotificationBell } from '@/components/alerts/notification-bell'
import { ThemeToggle } from '@/components/theme-toggle'

const navItems = [
  { href: '/dashboard',             label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/dashboard/prospects',   label: 'Pipeline',        icon: Kanban },
  { href: '/dashboard/leads',       label: 'Prospects',       icon: Users },
  { href: '/dashboard/vehicules',   label: 'Véhicules',       icon: Car },
  { href: '/dashboard/activites',   label: 'Activités',       icon: Activity },
  { href: '/dashboard/alerts',      label: 'Alertes',         icon: BellRing },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [userName, setUserName] = useState('Utilisateur')
  const [userInitial, setUserInitial] = useState('U')
  const [userId, setUserId] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

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
      setUserId(data.user.id)
    })
  }, [router])

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Shared sidebar body so desktop + mobile drawer stay in sync.
  const sidebarBody = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-100 border border-indigo-200 dark:bg-indigo-500/20 dark:border-indigo-500/30">
          <Car className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="flex-1">
          <p className="text-gray-900 dark:text-white text-base font-bold leading-none tracking-tight">AutoDex</p>
        </div>
        {/* Close button — mobile drawer only */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
          aria-label="Fermer le menu"
        >
          <X className="w-4 h-4" />
        </button>
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
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-150',
                isActive
                  ? 'bg-indigo-50 text-indigo-900 font-medium dark:bg-indigo-500/15 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-white/45 dark:hover:text-white/75 dark:hover:bg-white/5'
              )}
            >
              <Icon className={cn('w-4 h-4 flex-shrink-0', isActive && 'text-indigo-600 dark:text-indigo-400')} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 pb-3 border-t border-gray-200 dark:border-white/[0.06] pt-2 space-y-0.5">
        <Link
          href="/dashboard/parametres"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-150',
            pathname === '/dashboard/parametres'
              ? 'bg-indigo-50 text-indigo-900 font-medium dark:bg-indigo-500/15 dark:text-white'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-white/45 dark:hover:text-white/75 dark:hover:bg-white/5'
          )}
        >
          <Settings className="w-4 h-4" />
          Paramètres
        </Link>
        <Link
          href="/dashboard/settings/integrations"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-md text-xs transition-colors duration-150',
            pathname.startsWith('/dashboard/settings/integrations')
              ? 'bg-indigo-50 text-indigo-900 font-medium dark:bg-indigo-500/15 dark:text-white'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-white/40 dark:hover:text-white/70 dark:hover:bg-white/5'
          )}
        >
          <Plug className="w-3.5 h-3.5" />
          Intégrations
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-white/45 dark:hover:text-white/75 dark:hover:bg-white/5 transition-colors duration-150"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>

      {/* User pill */}
      <div className="mx-2 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 border border-gray-200 dark:bg-white/5 dark:border-white/[0.08]">
        <div className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[11px] font-bold">{userInitial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 dark:text-white/80 text-xs font-medium truncate">{userName}</p>
        </div>
        <MoreVertical className="w-3.5 h-3.5 text-gray-400 dark:text-white/30 flex-shrink-0" />
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-gray-200 dark:bg-background dark:border-white/[0.06] flex-shrink-0">
        {sidebarBody}
      </aside>

      {/* ── Mobile drawer + backdrop ────────────────────────── */}
      {/* Backdrop */}
      <div
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
        className={cn(
          'md:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-300',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      />
      {/* Drawer */}
      <aside
        className={cn(
          'md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-white border-r border-gray-200 dark:bg-background dark:border-white/[0.06]',
          'transform transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
      >
        {sidebarBody}
      </aside>

      {/* ── Main content ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between h-14 px-4 md:px-6 bg-background border-b border-border/60 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm min-w-0">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell userId={userId} />
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">{userInitial}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto animate-in fade-in duration-300">
          {children}
        </main>
      </div>
    </div>
  )
}
