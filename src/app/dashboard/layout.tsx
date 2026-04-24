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
  ChevronDown,
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

  function activeLabel() {
    const item = navItems.find(
      (n) => n.href === pathname || (n.href !== '/dashboard' && pathname.startsWith(n.href))
    )
    return item?.label ?? 'Autodex'
  }

  // Shared sidebar body so desktop + mobile drawer stay in sync.
  const sidebarBody = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30">
          <Car className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1">
          <p className="text-white text-sm font-semibold leading-none tracking-tight">Autodex</p>
          <p className="text-white/30 text-[10px] mt-0.5 leading-none">Automobile · Algérie</p>
        </div>
        {/* Close button — mobile drawer only */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Fermer le menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 pt-4 pb-2 space-y-0.5 overflow-y-auto">
        <p className="text-white/30 text-[10px] uppercase tracking-wider px-3 mb-1 mt-1 font-semibold">
          Navigation
        </p>
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
                'relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150',
                isActive
                  ? 'bg-white/[0.07] text-white before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-indigo-500'
                  : 'text-white/45 hover:text-white/75 hover:bg-white/5'
              )}
            >
              <Icon className={cn('w-4 h-4 flex-shrink-0', isActive && 'text-indigo-400')} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 pb-3 border-t border-white/[0.06] pt-2 space-y-0.5">
        <p className="text-white/30 text-[10px] uppercase tracking-wider px-3 mb-1 mt-1 font-semibold">
          Compte
        </p>
        <Link
          href="/dashboard/parametres"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-150',
            pathname === '/dashboard/parametres'
              ? 'bg-white/[0.07] text-white before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-indigo-500'
              : 'text-white/45 hover:text-white/75 hover:bg-white/5'
          )}
        >
          <Settings className="w-4 h-4" />
          Paramètres
        </Link>
        <Link
          href="/dashboard/settings/integrations"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'relative flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-md text-xs transition-colors duration-150',
            pathname.startsWith('/dashboard/settings/integrations')
              ? 'bg-white/[0.07] text-white before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-indigo-500'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
          )}
        >
          <Plug className="w-3.5 h-3.5" />
          Intégrations
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-white/45 hover:text-white/75 hover:bg-white/5 transition-colors duration-150"
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
    </>
  )

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 bg-[#0f1117] border-r border-white/[0.06] flex-shrink-0">
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
          'md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-[#0f1117] border-r border-white/[0.06]',
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
        <header className="flex items-center justify-between h-14 px-4 md:px-6 bg-card border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 text-sm min-w-0">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="hidden sm:inline text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Autodex
            </span>
            <span className="hidden sm:inline text-muted-foreground/60">/</span>
            <span className="text-foreground font-semibold text-sm truncate">{activeLabel()}</span>
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
