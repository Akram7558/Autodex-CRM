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
  CalendarClock,
  BadgeDollarSign,
  BellRing,
  Plug,
  Menu,
  X,
  Building2,
  ScrollText,
  Shield,
  Package,
  KeyRound,
  CarFront,
  Tag,
  Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { NotificationBell } from '@/components/alerts/notification-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import type { AppRole } from '@/lib/types'

// Showroom-side sidebar.
// `roles` is the set of AppRoles for whom the entry renders.
//   owner / manager  → everything
//   closer           → dashboard / prospects / rendez-vous
//   prospecteur      → dashboard / prospects
// Restricted users also lose the Paramètres / Intégrations footer
// links — that gating lives further down where the footer renders.
const navItems: Array<{ href: string; label: string; icon: typeof LayoutDashboard; roles: AppRole[]; module?: 'vente' | 'location' }> = [
  { href: '/dashboard',              label: 'Tableau de bord', icon: LayoutDashboard, roles: ['owner','manager','closer','prospecteur'], module: 'vente' },
  { href: '/dashboard/prospects',    label: 'Pipeline',        icon: Kanban,          roles: ['owner','manager'], module: 'vente' },
  { href: '/dashboard/leads',        label: 'Prospects',       icon: Users,           roles: ['owner','manager','closer','prospecteur'], module: 'vente' },
  { href: '/dashboard/rendez-vous',  label: 'Rendez-vous',     icon: CalendarClock,   roles: ['owner','manager','closer'], module: 'vente' },
  { href: '/dashboard/ventes',       label: 'Ventes',          icon: BadgeDollarSign, roles: ['owner','manager'], module: 'vente' },
  { href: '/dashboard/vehicules',    label: 'Véhicules',       icon: Car,             roles: ['owner','manager'], module: 'vente' },
  { href: '/dashboard/precommandes', label: 'Pré-commandes',   icon: Package,         roles: ['owner','manager'], module: 'vente' },
  // Module Location (Phase 1) — separate fleet from sales vehicles.
  { href: '/dashboard/location',           label: 'Location',         icon: KeyRound,    roles: ['owner','manager','closer'], module: 'location' },
  { href: '/dashboard/location/prospects', label: 'Prospects location', icon: Inbox,    roles: ['owner','manager','closer'], module: 'location' },
  { href: '/dashboard/location/contrats',  label: 'Contrats location', icon: ScrollText, roles: ['owner','manager','closer'], module: 'location' },
  { href: '/dashboard/location/agenda',    label: 'Agenda location',  icon: CalendarClock, roles: ['owner','manager','closer'], module: 'location' },
  { href: '/dashboard/location/vehicules', label: 'Flotte location',  icon: CarFront,  roles: ['owner','manager'], module: 'location' },
  { href: '/dashboard/location/clients',   label: 'Clients location', icon: Users,     roles: ['owner','manager'], module: 'location' },
  { href: '/dashboard/location/tarifs',    label: 'Tarifs location',  icon: Tag,       roles: ['owner'], module: 'location' },
  { href: '/dashboard/activites',    label: 'Activités',       icon: Activity,        roles: ['owner','manager'], module: 'vente' },
  { href: '/dashboard/alerts',       label: 'Alertes',         icon: BellRing,        roles: ['owner','manager'] },
  // `Paramètres` is rendered in the sidebar footer (`!isInternalTeam`
  // block) so we don't duplicate it in the main nav.
]

// ── Super-admin sidebar ────────────────────────────────────────────
// Full sidebar with all internal sections.
const superAdminNavItems = [
  { href: '/dashboard/super-admin',              label: 'Tableau de bord', icon: Shield },
  { href: '/dashboard/super-admin/showrooms',    label: 'Showrooms',       icon: Building2 },
  { href: '/dashboard/super-admin/prospects',    label: 'Prospects SaaS',  icon: Users },
  { href: '/dashboard/super-admin/rendez-vous',  label: 'RDV SaaS',        icon: CalendarClock },
  { href: '/dashboard/super-admin/utilisateurs', label: 'Utilisateurs',    icon: Users },
  { href: '/dashboard/super-admin/logs',         label: 'Logs',            icon: ScrollText },
  { href: '/dashboard/super-admin/parametres',   label: 'Paramètres',      icon: Settings },
]

// ── Commercial sidebar ─────────────────────────────────────────────
// Same as super-admin minus Logs / Paramètres / Utilisateurs.
const commercialNavItems = [
  { href: '/dashboard/super-admin',              label: 'Tableau de bord', icon: Shield },
  { href: '/dashboard/super-admin/showrooms',    label: 'Showrooms',       icon: Building2 },
  { href: '/dashboard/super-admin/prospects',    label: 'Prospects SaaS',  icon: Users },
  { href: '/dashboard/super-admin/rendez-vous',  label: 'RDV SaaS',        icon: CalendarClock },
]

// ── prospecteur_saas sidebar ───────────────────────────────────────
// Only the SaaS prospects page.
const prospecteurSaasNavItems = [
  { href: '/dashboard/super-admin/prospects',    label: 'Prospects SaaS',  icon: Users },
]

function navItemsForRole(role: AppRole | null) {
  switch (role) {
    case 'super_admin':       return superAdminNavItems
    case 'commercial':        return commercialNavItems
    case 'prospecteur_saas':  return prospecteurSaasNavItems
    case 'owner':
    case 'manager':
    case 'closer':
    case 'prospecteur':
      return navItems.filter((it) => it.roles.includes(role))
    default:
      // Unknown / unprovisioned role: render nothing showroom-side.
      return []
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [userName, setUserName] = useState('Utilisateur')
  const [userInitial, setUserInitial] = useState('U')
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<AppRole | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  // Optimistic active-nav override. `usePathname()` only updates after a
  // navigation commits, so on slower (data-fetching) routes the green
  // highlight visibly trails the click. We snap it to the clicked href
  // immediately and let the real pathname take over once it catches up.
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null)
  // Module flags (nav gating). Default both-ON until resolved + for
  // super_admin / SaaS roles (no showroom). Server guards (requireModule) do
  // the real block; this just hides nav the showroom's plan doesn't include.
  const [modules, setModules] = useState<{ vente: boolean; location: boolean }>({ vente: true, location: true })

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
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

      // Look up role to decide which sidebar to render. Falls back
      // gracefully if user_roles isn't migrated yet.
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role, showroom_id')
        .eq('user_id', data.user.id)
        .maybeSingle()
      setUserRole((roleRow?.role as AppRole | undefined) ?? null)

      // Module flags for nav gating. No showroom (super_admin / SaaS) → both
      // ON (defaults). Fail-open if the showroom row can't be read.
      const sid = (roleRow?.showroom_id as string | null) ?? null
      if (sid) {
        const { data: sr } = await supabase
          .from('showrooms')
          .select('module_vente, module_location')
          .eq('id', sid)
          .maybeSingle()
        if (sr) setModules({
          vente: (sr as { module_vente?: boolean }).module_vente !== false,
          location: (sr as { module_location?: boolean }).module_location !== false,
        })
      }
    })
  }, [router])

  // Filter by ROLE (existing) then by MODULE: keep items with no module tag,
  // or whose module is enabled for this showroom. super_admin / SaaS keep
  // both modules ON, so their sidebars are unaffected.
  const isLocationOnly = !modules.vente && modules.location
  const activeNavItems = navItemsForRole(userRole)
    .filter((it) => {
      const mod = (it as { module?: 'vente' | 'location' }).module
      return !mod || (mod === 'vente' ? modules.vente : modules.location)
    })
    // Location-only plan: the "Location" hub is the showroom's whole product,
    // so relabel it "Statistique location". Complet / vente-only keep "Location".
    .map((it) =>
      isLocationOnly && it.href === '/dashboard/location'
        ? { ...it, label: 'Statistique location' }
        : it,
    )

  // Effective path used for active-state computation: the optimistic
  // override while a navigation is in flight, otherwise the real path.
  const effectivePath = optimisticHref ?? pathname

  // Internal-team roles (super_admin, commercial, prospecteur_saas) have
  // their own Paramètres / Intégrations entries inside `activeNavItems`,
  // so hiding the showroom-side footer links keeps the sidebar from
  // showing duplicate "Paramètres" / "Intégrations" buttons for them.
  const isInternalTeam =
    userRole === 'super_admin' ||
    userRole === 'commercial'  ||
    userRole === 'prospecteur_saas'

  // Showroom-side footer links (Paramètres / Intégrations) are owner-
  // and manager-only — closer/prospecteur shouldn't see them either.
  const canSeeShowroomSettings =
    userRole === 'owner' || userRole === 'manager'

  // On every committed route change: close the mobile drawer and drop the
  // optimistic override so the real pathname becomes the source of truth
  // again (handles browser back/forward and redirects too).
  useEffect(() => {
    setMobileOpen(false)
    setOptimisticHref(null)
  }, [pathname])

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  // Derive page title from current path for the header.
  const pageTitle = (() => {
    // Order matters: longest prefix first (sub-routes before /dashboard).
    const all = [...activeNavItems].sort((a, b) => b.href.length - a.href.length)
    const match = all.find((it) =>
      it.href === pathname ||
      (it.href !== '/dashboard' && pathname.startsWith(it.href))
    )
    if (match) return match.label
    if (pathname.startsWith('/dashboard/settings/integrations')) return 'Intégrations'
    if (pathname.startsWith('/dashboard/parametres')) return 'Paramètres'
    return 'Tableau de bord'
  })()

  // Render-time `new Date()` in the SSR pass diverges from the client
  // first paint (different minute), which trips React #418 across every
  // dashboard route. We render a stable placeholder on SSR and replace
  // it post-mount via useEffect (refreshed every 60s).
  const [updatedLabel, setUpdatedLabel] = useState<string | null>(null)
  useEffect(() => {
    const tick = () => {
      const d  = new Date()
      const hh = d.getHours().toString().padStart(2, '0')
      const mm = d.getMinutes().toString().padStart(2, '0')
      setUpdatedLabel(`Mise à jour : Aujourd'hui, ${hh}:${mm}`)
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Shared sidebar body so desktop + mobile drawer stay in sync.
  const sidebarBody = (
    <>
      {/* Logo — "Dex" carries the emerald accent (FoCar mark). */}
      <div className="flex items-center gap-3 px-6 h-20 flex-shrink-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
          <Car className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-xl font-bold tracking-tight leading-none">
            <span className="text-zinc-900 dark:text-white">Auto</span>
            <span className="text-emerald-500 dark:text-emerald-400">Dex</span>
          </p>
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

      {/* Navigation — FoCar-style. Active item picked by longest-prefix
          match over all visible items so a parent + its sub-link can
          never both light up emerald at once. */}
      <nav className="flex-1 px-3 pt-2 pb-2 space-y-0.5 overflow-y-auto">
        {(() => {
          // Resolve the single active href via longest-prefix match.
          // Roots (/dashboard, /dashboard/super-admin) match exactly so
          // their child routes don't keep highlighting the parent.
          const ROOT = new Set(['/dashboard', '/dashboard/super-admin'])
          const candidates = activeNavItems
            .map((it) => it.href)
            .filter((href) => {
              if (ROOT.has(href)) return effectivePath === href
              return effectivePath === href || effectivePath.startsWith(href + '/')
            })
          const activeHref = candidates.reduce<string | null>(
            (best, h) => (best == null || h.length > best.length ? h : best),
            null,
          )

          return activeNavItems.map((item, idx) => {
            const Icon = item.icon
            const isActive = item.href === activeHref
            // Insert a hairline separator before the first rental item
            // so the rental section reads as its own group (matches the
            // footer's border-t style above Paramètres / Déconnexion).
            const prev = activeNavItems[idx - 1]
            const isFirstRental = item.href.startsWith('/dashboard/location') &&
              (!prev || !prev.href.startsWith('/dashboard/location'))

            return (
              <div key={item.href}>
                {isFirstRental && (
                  <div
                    aria-hidden="true"
                    className="my-2 mx-1 border-t border-zinc-100 dark:border-white/5"
                  />
                )}
                <Link
                  href={item.href}
                  onClick={() => { setOptimisticHref(item.href); setMobileOpen(false) }}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-150 ease-out motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40',
                    isActive
                      ? 'bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-500/30'
                      : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100',
                  )}
                >
                  <Icon className={cn(
                    'w-4 h-4 flex-shrink-0',
                    isActive ? 'text-white' : '',
                  )} />
                  {item.label}
                </Link>
              </div>
            )
          })
        })()}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-zinc-100 dark:border-white/5 space-y-0.5">
        {!isInternalTeam && canSeeShowroomSettings && (
          <>
            <Link
              href="/dashboard/parametres"
              onClick={() => { setOptimisticHref('/dashboard/parametres'); setMobileOpen(false) }}
              aria-current={effectivePath === '/dashboard/parametres' ? 'page' : undefined}
              className={cn(
                'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-150 ease-out motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40',
                effectivePath === '/dashboard/parametres'
                  ? 'bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-500/30'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100',
              )}
            >
              <Settings className={cn('w-4 h-4', effectivePath === '/dashboard/parametres' ? 'text-white' : '')} />
              Paramètres
            </Link>
            <Link
              href="/dashboard/settings/integrations"
              onClick={() => { setOptimisticHref('/dashboard/settings/integrations'); setMobileOpen(false) }}
              aria-current={effectivePath.startsWith('/dashboard/settings/integrations') ? 'page' : undefined}
              className={cn(
                'group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-150 ease-out motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40',
                effectivePath.startsWith('/dashboard/settings/integrations')
                  ? 'bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-500/30'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100',
              )}
            >
              <Plug className={cn('w-4 h-4', effectivePath.startsWith('/dashboard/settings/integrations') ? 'text-white' : '')} />
              Intégrations
            </Link>
          </>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100 transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>

      {/* User pill — emerald gradient avatar, glassy chip on dark */}
      <div className="mx-3 mb-4 flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 dark:bg-white/[0.03] dark:border-white/[0.06]">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/30">
          <span className="text-white text-[11px] font-bold">{userInitial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-zinc-900 dark:text-white text-xs font-semibold truncate">{userName}</p>
          {userRole && (
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 capitalize">{userRole.replace('_', ' ')}</p>
          )}
        </div>
        <MoreVertical className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 flex-shrink-0" />
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 bg-[var(--sidebar)] border-r border-[var(--sidebar-border)] shadow-sm dark:shadow-none flex-shrink-0 transition-colors duration-500">
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
          'md:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-[var(--sidebar)] border-r border-[var(--sidebar-border)]',
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
        {/* Top bar — kept slim so the dashboard pages own the headline. */}
        <header className="flex items-center justify-between h-16 px-4 md:px-10 bg-[var(--bg-main)] flex-shrink-0 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-white/[0.04] transition-colors"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden md:flex flex-col min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)] truncate">
                {pageTitle}
              </p>
              <p
                className="text-[10px] text-[var(--text-secondary)] truncate"
                suppressHydrationWarning
              >
                {updatedLabel ?? 'Mise à jour : —'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell userId={userId} />
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-[13px] shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-500/20">
              {userInitial}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
          <footer className="mt-16 pb-10 text-center text-zinc-500 text-[10px] font-semibold uppercase tracking-[0.3em]">
            &copy; 2026 AutoDex • All Systems Operations Optimal
          </footer>
        </main>
      </div>
    </div>
  )
}
