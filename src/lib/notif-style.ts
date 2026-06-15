// ─────────────────────────────────────────────────────────────────────
// Notifications — shared visual style (single source of truth).
// ─────────────────────────────────────────────────────────────────────
// Both surfaces (the bell dropdown + the /dashboard/alerts page) consume
// this so icons, severities and tones stay identical. Design direction:
// severity-colored icon tiles (rose / amber / emerald) on neutral chrome,
// emerald = the AutoDex brand accent (var(--accent)) — no indigo.
// ─────────────────────────────────────────────────────────────────────

import { type LucideIcon, AlertTriangle, Clock, PackageX, UserX, AlertOctagon, Banknote, PhoneOff, XCircle } from 'lucide-react'
import type { NotificationType } from '@/lib/types'

export type Severity = 'critical' | 'warning' | 'info'

export type NotifMeta = { Icon: LucideIcon; severity: Severity; label: string }

/**
 * Map a notification type → icon + severity + short label. Icons reuse the
 * bell's existing lucide choices. temp_cold rows are type 'lead_stagnant', so
 * they fall under that case (warning). Anything unknown falls back to info.
 */
export function notifMeta(type: NotificationType): NotifMeta {
  switch (type) {
    case 'escalation':      return { Icon: AlertOctagon,  severity: 'critical', label: 'Escalade' }
    case 'lead_ignored':    return { Icon: AlertTriangle, severity: 'warning',  label: 'Lead ignoré' }
    case 'lead_stagnant':   return { Icon: Clock,         severity: 'warning',  label: 'Lead stagnant' }
    case 'stock_rupture':   return { Icon: PackageX,      severity: 'warning',  label: 'Rupture de stock' }
    case 'vendor_inactive': return { Icon: UserX,         severity: 'warning',  label: 'Vendeur inactif' }
    case 'reminder':        return { Icon: Clock,         severity: 'info',     label: 'Rappel' }
    case 'gros_paiement':   return { Icon: Banknote,      severity: 'info',     label: 'Gros paiement' }
    case 'client_silence_3':return { Icon: PhoneOff,      severity: 'warning',  label: 'Client ne répond plus' }
    case 'annulation':      return { Icon: XCircle,       severity: 'critical', label: 'Location annulée' }
    default:                return { Icon: AlertTriangle, severity: 'info',     label: 'Alerte' }
  }
}

export type ToneClasses = {
  /** icon tile: bg + text */
  tile: string
  /** unread / status dot bg */
  dot: string
  /** primary action button */
  primaryBtn: string
  /** subtle row/card highlight bg */
  highlightBg: string
}

/**
 * Severity → className strings. critical = rose, warning = amber, info =
 * EMERALD via the brand token (var(--accent) + its rgba tints --accent-fill
 * /--accent-subtle, defined for both light + dark in globals.css). rose/amber
 * carry explicit dark: variants so dark mode holds.
 */
export function toneClasses(severity: Severity): ToneClasses {
  switch (severity) {
    case 'critical':
      return {
        tile:        'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
        dot:         'bg-rose-500',
        primaryBtn:  'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20',
        highlightBg: 'bg-rose-50/50 dark:bg-rose-500/10',
      }
    case 'warning':
      return {
        tile:        'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
        dot:         'bg-amber-500',
        primaryBtn:  'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20',
        highlightBg: 'bg-amber-50/50 dark:bg-amber-500/10',
      }
    case 'info':
    default:
      return {
        tile:        'bg-[var(--accent-fill)] text-[var(--accent)]',
        dot:         'bg-[var(--accent)]',
        primaryBtn:  'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white',
        highlightBg: 'bg-[var(--accent-subtle)]',
      }
  }
}
