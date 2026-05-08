// ─────────────────────────────────────────────────────────────────────
// POST /api/admin/convert-trial
// ─────────────────────────────────────────────────────────────────────
// Marks a trial showroom as paid:
//   - is_trial          = false
//   - trial_ends_at     = expires_at (now interpreted as subscription end)
//   - trial_converted_at = now()
//   - trial_contract_amount = body.contract_amount
//   - trial_converted_by = caller's auth.uid
//
// Then sends two emails (best-effort): congratulations to the owner,
// notification to the AutoDex internal inbox.
//
// Caller MUST be authenticated with role = 'super_admin'.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSuperAdmin, errorResponse } from '@/lib/api-auth'
import {
  sendEmail, internalNotifyAddress,
  trialConvertedEmail, internalConvertedEmail,
  formatDateFr,
} from '@/lib/resend'

export const runtime = 'nodejs'

function formatDzd(n: number): string {
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(n)
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSuperAdmin(req)

    const body = await req.json().catch(() => ({}))
    const showroom_id     = String(body.showroom_id ?? '').trim()
    const contract_amount = Number(body.contract_amount)
    const expiresRaw      = String(body.expires_at ?? '').trim()

    if (!showroom_id) {
      return NextResponse.json({ error: 'showroom_id requis.' }, { status: 400 })
    }
    if (!Number.isFinite(contract_amount) || contract_amount < 0) {
      return NextResponse.json({ error: 'Montant du contrat invalide.' }, { status: 400 })
    }
    if (!expiresRaw) {
      return NextResponse.json({ error: 'Date d\'expiration requise.' }, { status: 400 })
    }
    const expires = new Date(expiresRaw)
    if (Number.isNaN(expires.getTime())) {
      return NextResponse.json({ error: 'Date d\'expiration invalide.' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquant.' }, { status: 500 })
    }
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Update the showroom ──────────────────────────────────────────
    const { data: updated, error: updErr } = await admin
      .from('showrooms')
      .update({
        is_trial:              false,
        trial_ends_at:         expires.toISOString(),
        trial_converted_at:    new Date().toISOString(),
        trial_contract_amount: contract_amount,
        trial_converted_by:    ctx.user.id,
      })
      .eq('id', showroom_id)
      .select('id, name, owner_email')
      .single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })
    if (!updated) {
      return NextResponse.json({ error: 'Showroom introuvable.' }, { status: 404 })
    }

    const expiresFr = formatDateFr(expires)

    // ── Owner email (best-effort) ────────────────────────────────────
    let ownerEmail: string | null = (updated.owner_email as string | null) ?? null
    if (!ownerEmail) {
      // Fallback: look up the owner's email via auth.users.
      const { data: ownerRole } = await admin
        .from('user_roles')
        .select('user_id')
        .eq('showroom_id', showroom_id)
        .eq('role', 'owner')
        .maybeSingle()
      if (ownerRole?.user_id) {
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
        const u = list?.users.find(x => x.id === ownerRole.user_id)
        ownerEmail = u?.email ?? null
      }
    }

    let ownerSent = false
    let ownerErr: string | undefined
    if (ownerEmail) {
      const tpl = trialConvertedEmail({
        showroomName: String(updated.name),
        expiresAtFr:  expiresFr,
      })
      const r = await sendEmail({
        to:      ownerEmail,
        subject: tpl.subject,
        text:    tpl.text,
        html:    tpl.html,
      })
      ownerSent = r.ok
      if (!r.ok) ownerErr = r.error
    }

    // ── Internal notification ────────────────────────────────────────
    const internal = internalConvertedEmail({
      showroomName:   String(updated.name),
      contractAmount: formatDzd(contract_amount),
      expiresAtFr:    expiresFr,
    })
    const internalRes = await sendEmail({
      to:      internalNotifyAddress(),
      subject: internal.subject,
      text:    internal.text,
    })

    return NextResponse.json({
      success:                true,
      owner_email_sent:       ownerSent,
      owner_email_error:      ownerErr,
      internal_email_sent:    internalRes.ok,
      internal_email_error:   internalRes.ok ? undefined : internalRes.error,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
