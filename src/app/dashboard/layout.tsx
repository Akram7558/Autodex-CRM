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

  // Derive page title from current path for the header.
  const pageTitle = (() => {
    const match = navItems.find((it) =>
      it.href === pathname ||
      (it.href !== '/dashboard' && pathname.startsWith(it.href))
    )
    if (match) return match.label
    if (pathname.startsWith('/dashboard/settings/integrations')) return 'Intégrations'
    if (pathname.startsWith('/dashboard/parametres')) return 'Paramètres'
    return 'Tableau de bord'
  })()

  const updatedLabel = (() => {
    const now = new Date()
    const hh = now.getHours().toString().padStart(2, '0')
    const mm = now.getMinutes().toString().padStart(2, '0')
    return `Mise à jour : Aujourd'hui, ${hh}:${mm}`
  })()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Shared sidebar body so desktop + mobile drawer stay in sync.
  const sidebarBody = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 h-20 flex-shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600">
          <Car className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-zinc-900 dark:text-white text-xl font-bold uppercase tracking-tight leading-none">AutoDex</p>
        </div>
        {/* Close button — mobile drawer only */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-white dark:hover:bg-zinc-900 transition-colors"
          aria-label="Fermer le menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 pt-2 pb-2 space-y-2 overflow-y-auto">
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
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
                isActive
                  ? 'bg-indigo-50 text-indigo-600 border border-indigo-100 dark:bg-zinc-900 dark:text-indigo-400 dark:border dark:border-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white border border-transparent'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-6 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
        <Link
          href="/dashboard/parametres"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
            pathname === '/dashboard/parametres'
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
          )}
        >
          <Settings className="w-4 h-4" />
          Paramètres
        </Link>
        <Link
          href="/dashboard/settings/integrations"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
            pathname.startsWith('/dashboard/settings/integrations')
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
          )}
        >
          <Plug className="w-4 h-4" />
          Intégrations
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>

      {/* User pill */}
      <div className="mx-4 mb-4 flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800">
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[11px] font-bold">{userInitial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-zinc-900 dark:text-white text-xs font-semibold truncate">{userName}</p>
        </div>
        <MoreVertical className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-zinc-200 shadow-sm dark:bg-zinc-950 dark:border-zinc-800 dark:shadow-none flex-shrink-0 transition-colors duration-500">
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
          'md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-white border-r border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800',
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
        <header className="flex items-center justify-between h-20 px-4 md:px-10 bg-background flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col min-w-0">
              <h1 className="text-xl font-black uppercase tracking-tighter text-zinc-900 dark:text-white truncate">
                {pageTitle}
              </h1>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                {updatedLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <ThemeToggle />
            <NotificationBell userId={userId} />
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-600/20">
              {userInitial}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto animate-in fade-in duration-300">
          {children}
          <footer className="mt-16 pb-10 text-center text-zinc-500 text-[10px] font-bold uppercase tracking-[0.3em]">
            &copy; 2026 AutoDex • All Systems Operations Optimal
          </footer>
        </main>
      </div>
    </div>
  )
}
