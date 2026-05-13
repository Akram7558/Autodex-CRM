'use client'
// ─────────────────────────────────────────────────────────────────────
// ReminderBanner — top-of-dashboard urgency strip driven by migration
// 34's reminder + escalation pipeline.
// ─────────────────────────────────────────────────────────────────────
// Two flavours, chosen by the caller's role:
//
//   • closer / prospecteur (the assignees):
//       "⚠️ X leads attendent votre contact !"
//       Filter: leads.assigned_to = me AND reminder_count > 0
//
//   • owner / manager (the supervisors):
//       "🔴 X leads escaladés — relance non effectuée"
//       Filter: leads.escalated = true
//
// The query runs through the authenticated supabase client, so RLS
// from migration 32 + 33 keeps each role scoped to data they're
// allowed to see. Hidden when count = 0.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
import { AlertTriangle, ArrowRight, Flame } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/lib/types'

const CLOSED_SUIVI = ['vendu', 'perdu', 'annule', 'reserve']

export default function ReminderBanner({
  role, userId,
}: {
  role: AppRole | null
  userId: string | null
}) {
  const [pendingCount,    setPendingCount]    = useState(0)
  const [escalatedCount,  setEscalatedCount]  = useState(0)
  const [loaded,          setLoaded]          = useState(false)

  // Decide what to fetch based on role.
  const isAssignee   = role === 'closer' || role === 'prospecteur'
  const isSupervisor = role === 'owner'  || role === 'manager'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (isAssignee && userId) {
        const { count } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', userId)
          .gt('reminder_count', 0)
          .not('suivi', 'in', `(${CLOSED_SUIVI.join(',')})`)
        if (!cancelled) setPendingCount(count ?? 0)
      } else if (isSupervisor) {
        const { count } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('escalated', true)
          .not('suivi', 'in', `(${CLOSED_SUIVI.join(',')})`)
        if (!cancelled) setEscalatedCount(count ?? 0)
      }
      if (!cancelled) setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [isAssignee, isSupervisor, userId])

  if (!loaded) return null

  if (isAssignee && pendingCount > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-rose-600 text-white px-5 py-4 shadow-lg shadow-rose-600/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3">
          <Flame className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-sm sm:text-base">
              ⚠️ {pendingCount} lead{pendingCount > 1 ? 's' : ''} attend
              {pendingCount > 1 ? 'ent' : ''} votre contact !
            </p>
            <p className="text-[12px] sm:text-xs text-rose-50/90 mt-0.5">
              Vous avez {pendingCount} lead{pendingCount > 1 ? 's' : ''} non contacté
              {pendingCount > 1 ? 's' : ''} avec un rappel actif. Relancez-les avant qu&apos;ils ne refroidissent.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/leads?filter=pending"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur text-sm font-bold transition-colors shrink-0"
        >
          Voir mes leads en attente <ArrowRight className="w-4 h-4" />
        </Link>
      </motion.div>
    )
  }

  if (isSupervisor && escalatedCount > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-rose-700 text-white px-5 py-4 shadow-lg shadow-rose-700/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-sm sm:text-base">
              🔴 {escalatedCount} lead{escalatedCount > 1 ? 's' : ''} escaladé
              {escalatedCount > 1 ? 's' : ''} — relance non effectuée
            </p>
            <p className="text-[12px] sm:text-xs text-rose-50/90 mt-0.5">
              Vos employés n&apos;ont pas relancé ces leads malgré les rappels automatiques.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/leads?filter=escalated"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur text-sm font-bold transition-colors shrink-0"
        >
          Voir les escalades <ArrowRight className="w-4 h-4" />
        </Link>
      </motion.div>
    )
  }

  return null
}
