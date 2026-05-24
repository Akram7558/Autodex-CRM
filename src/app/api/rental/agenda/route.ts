// ─────────────────────────────────────────────────────────────────────
// GET /api/rental/agenda
// ─────────────────────────────────────────────────────────────────────
// Live rental reminders for the notification bell: today/tomorrow pickups
// and returns + overdue rentals. Computed on demand (no stored rows),
// scoped to the caller's showroom and — for closer — their own rentals.
// Returns a flat, urgency-ordered list (overdue → pickups → returns).
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { errorResponse, requireShowroomMember } from '@/lib/api-auth'
import { computeRentalAgenda, algiersToday, addDaysISO } from '@/lib/rental/agenda'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireShowroomMember(req)
    const agenda = await computeRentalAgenda(ctx.authSb, {
      showroomId: ctx.showroomId,
      role: ctx.role,
      userId: ctx.user.id,
    })
    const items = [...agenda.overdue, ...agenda.pickups, ...agenda.returns]
    const today = algiersToday()
    return NextResponse.json({
      items,
      count: items.length,
      today,
      tomorrow: addDaysISO(today, 1),
    })
  } catch (err) {
    return errorResponse(err)
  }
}
