// ─────────────────────────────────────────────────────────────────────
// /api/rental/rentals/[id]/pickup
// ─────────────────────────────────────────────────────────────────────
// "Voiture récupérée" — moves confirmed → active, gated on FULL financial
// settlement: the remaining rent (total_rental_amount − Σ rental_payment)
// AND the remaining caution (deposit_amount − (Σ deposit − Σ refund)) must
// both be brought to zero by the submitted payments (or already be zero).
//
// confirmed → active was removed from PATCH /api/rental/rentals/[id] so a
// pickup ALWAYS goes through here and ALWAYS enforces the gate (mirroring
// how draft → confirmed lives only in /reserve).
//
// Role guard (operational, not financial): owner/manager/super_admin and
// closer-on-own-contracts — same as the previous PATCH pickup permission.
// RLS already lets closers SELECT/INSERT rental_payments on their own
// rentals (migration_38), so the inserts pass.
//
// GET  → { total, payeLoyer, resteLoyer, cautionAttendue, cautionPercue, cautionRestante }
//        (used by the PickupDialog on open).
// POST → body { payments: [{ kind:'rent'|'caution', amount, method,
//        reference?, notes?, receipt_path? }] }. Non-cash methods require a
//        receipt_path that starts with `{ctx.showroomId}/rentals/{id}/`
//        (path-tampering guard; storage RLS already seals the showroom
//        prefix). Recomputes the paid sums from the DB before the gate
//        check, so the client total is never trusted.
//
// SAFE ORDER (no DB transaction available):
//   1. Validate body + load rental + gate against authoritative paid sums.
//   2. Insert every submitted payment (with receipt_url when present),
//      collecting their ids.
//   3. Flip confirmed → active, guarded with .eq('status','confirmed').
//   4. If the flip fails (concurrent change) OR any insert throws, delete
//      every payment we just inserted → 4xx/5xx → caller can retry.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'
import { toNum, formatDZD } from '@/components/rental/booking/types'
import { insertRentalPayment, RENTAL_PAYMENT_METHOD_SET } from '@/lib/rental/create-payment'
import { computeRentalFinance } from '@/lib/rental/finance'
import { logRentalActivity } from '@/lib/rental/activity'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])

// Service-role client — used ONLY to persist the customer's CIN/permis photo
// paths at pickup time. rental_customers UPDATE RLS is owner/manager-only
// (migration 38), but a pickup can be performed by a closer-on-own; rather
// than broaden the RLS policy (which would let closers edit every customer
// field globally), we write through the service role and scope the UPDATE
// explicitly to this rental's customer + showroom. No other column is touched.
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ApiError(500, 'Service role key missing.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ── Shared load + scope (returns the rental row + tallies; mirrors RLS) ──
async function loadRentalAndTallies(
  ctx: Awaited<ReturnType<typeof requireShowroomMember>>,
  id: string,
) {
  const { data: rentalRaw, error: loadErr } = await ctx.authSb
    .from('rentals')
    .select(
      'id, showroom_id, status, assigned_to, contract_number, total_rental_amount, ' +
      'deposit_amount, customer_id, rental_customers(cin_photo_url, permis_photo_url)',
    )
    .eq('id', id)
    .maybeSingle()
  if (loadErr) throw new ApiError(500, loadErr.message)
  if (!rentalRaw) throw new ApiError(404, 'Contrat introuvable.')

  // The embedded relation makes supabase-js infer a parser-union type, so we
  // cast through unknown to the concrete row shape we selected.
  const rental = rentalRaw as unknown as {
    id: string; showroom_id: string; status: string; assigned_to: string | null
    contract_number: string | null; total_rental_amount: unknown; deposit_amount: unknown
    customer_id: string
    rental_customers:
      | { cin_photo_url: string | null; permis_photo_url: string | null }
      | { cin_photo_url: string | null; permis_photo_url: string | null }[]
      | null
  }

  if (!ctx.isSuperAdmin && rental.showroom_id !== ctx.showroomId) {
    throw new ApiError(403, 'Contrat hors de votre showroom.')
  }
  if (ctx.role === 'closer' && rental.assigned_to !== ctx.user.id) {
    throw new ApiError(403, 'Vous ne pouvez modifier que vos propres contrats.')
  }

  const { data: pays, error: payErr } = await ctx.authSb
    .from('rental_payments')
    .select('type, amount')
    .eq('rental_id', id)
  if (payErr) throw new ApiError(500, payErr.message)

  // Shared pure helper — identical math to the fiche + the list expand panel.
  const f = computeRentalFinance({
    total:    rental.total_rental_amount as number | string | null,
    deposit:  rental.deposit_amount as number | string | null,
    payments: (pays ?? []) as { type: string; amount: number | string | null }[],
  })

  // The embedded customer comes back as a row or single-element array
  // depending on supabase-js version — flatten to read the photo paths.
  const custEmbed = rental.rental_customers
  const cust = Array.isArray(custEmbed) ? (custEmbed[0] ?? null) : custEmbed

  return {
    rental,
    customerId:      rental.customer_id,
    cinPhotoPath:    cust?.cin_photo_url ?? null,
    permisPhotoPath: cust?.permis_photo_url ?? null,
    total:           f.totalLoyer,
    payeLoyer:       f.payeLoyer,
    resteLoyer:      f.resteLoyer,
    cautionAttendue: f.cautionAttendue,
    cautionPercue:   f.cautionPercue,
    cautionRendue:   f.cautionRendue,
    cautionRestante: f.cautionRestante,
  }
}

// ─────────────────────────────────────────────────────────────────────
// GET — settlement summary (loading state for the PickupDialog).
// ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    const t = await loadRentalAndTallies(ctx, id)
    return NextResponse.json({
      total:           t.total,
      payeLoyer:       t.payeLoyer,
      resteLoyer:      t.resteLoyer,
      cautionAttendue: t.cautionAttendue,
      cautionPercue:   t.cautionPercue,
      cautionRestante: t.cautionRestante,
      // Document gate (PickupDialog "Documents du client" section).
      customerId:      t.customerId,
      cinPhotoPath:    t.cinPhotoPath,
      permisPhotoPath: t.permisPhotoPath,
    })
  } catch (err) {
    return errorResponse(err)
  }
}

// ─────────────────────────────────────────────────────────────────────
// POST — settle deficits + flip confirmed → active.
// ─────────────────────────────────────────────────────────────────────
type ValidatedPayment = {
  kind:       'rent' | 'caution'
  type:       'rental_payment' | 'deposit'
  amount:     number
  method:     string
  reference:  string | null
  notes:      string | null
  receiptUrl: string | null
}

export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    // ── Load + scope + status guard ────────────────────────────
    const t = await loadRentalAndTallies(ctx, id)
    if (t.rental.status !== 'confirmed') {
      throw new ApiError(409, 'Seul un contrat « Réservé » peut être récupéré.')
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    // ── DOCUMENT GATE: CIN + permis photos mandatory before pickup ──
    // Runs BEFORE any payment insert so a missing-document failure never
    // needs a rollback. Freshly-uploaded paths (if any) are persisted onto
    // the customer first (canonical, reusable across that client's rentals),
    // then the gate re-reads the authoritative paths from the DB — the
    // client value is never trusted for the gate itself.
    const docPrefix = `${t.rental.showroom_id}/customers/`
    const incomingCin =
      typeof body.cin_photo_url === 'string' ? body.cin_photo_url.trim() : ''
    const incomingPermis =
      typeof body.permis_photo_url === 'string' ? body.permis_photo_url.trim() : ''

    const custUpdate: { cin_photo_url?: string; permis_photo_url?: string } = {}
    if (incomingCin) {
      if (!incomingCin.startsWith(docPrefix)) {
        throw new ApiError(400, 'Chemin de la CIN invalide.')
      }
      custUpdate.cin_photo_url = incomingCin
    }
    if (incomingPermis) {
      if (!incomingPermis.startsWith(docPrefix)) {
        throw new ApiError(400, 'Chemin du permis invalide.')
      }
      custUpdate.permis_photo_url = incomingPermis
    }
    if (Object.keys(custUpdate).length > 0) {
      // Service-role write, scoped to this rental's customer + showroom so a
      // closer-on-own pickup can persist the docs despite owner/manager-only
      // RLS on rental_customers UPDATE.
      const admin = adminClient()
      const { error: cuErr } = await admin
        .from('rental_customers')
        .update(custUpdate)
        .eq('id', t.customerId)
        .eq('showroom_id', t.rental.showroom_id)
      if (cuErr) throw new ApiError(500, cuErr.message)
    }

    // Re-read from DB (RLS SELECT is allowed for all pickup roles incl.
    // closer) — both photos must now be on file.
    const { data: custRow, error: custErr } = await ctx.authSb
      .from('rental_customers')
      .select('cin_photo_url, permis_photo_url')
      .eq('id', t.customerId)
      .maybeSingle()
    if (custErr) throw new ApiError(500, custErr.message)
    if (!custRow?.cin_photo_url || !custRow?.permis_photo_url) {
      throw new ApiError(
        400,
        'Documents manquants — la photo de la CIN et celle du permis sont obligatoires avant la récupération.',
      )
    }

    // ── Validate each submitted payment ────────────────────────
    const rawPayments = Array.isArray(body.payments) ? body.payments : []
    const expectedPrefix = `${ctx.showroomId}/rentals/${id}/`

    let submittedRent = 0
    let submittedCaution = 0
    const validated: ValidatedPayment[] = []
    for (const item of rawPayments) {
      const o = (item ?? {}) as Record<string, unknown>
      const kind = String(o.kind ?? '')
      if (kind !== 'rent' && kind !== 'caution') {
        throw new ApiError(400, "kind invalide (attendu 'rent' ou 'caution').")
      }
      const method = String(o.method ?? '')
      if (!RENTAL_PAYMENT_METHOD_SET.has(method)) {
        throw new ApiError(400, 'Méthode de paiement invalide.')
      }
      const amount = Math.round(toNum(o.amount))
      if (!(amount > 0)) throw new ApiError(400, 'Montant invalide.')
      const reference = o.reference ? String(o.reference).slice(0, 120) : null
      const notes     = o.notes     ? String(o.notes).slice(0, 500)     : null

      let receiptUrl: string | null = null
      if (method !== 'cash') {
        const raw = o.receipt_path ? String(o.receipt_path).trim() : ''
        if (!raw) throw new ApiError(400, 'Photo du reçu obligatoire pour ce mode de paiement.')
        if (!raw.startsWith(expectedPrefix)) {
          throw new ApiError(400, 'Chemin du reçu invalide.')
        }
        receiptUrl = raw
      }

      const paymentType: 'rental_payment' | 'deposit' = kind === 'rent' ? 'rental_payment' : 'deposit'
      validated.push({ kind, type: paymentType, amount, method, reference, notes, receiptUrl })
      if (kind === 'rent') submittedRent += amount
      else                 submittedCaution += amount
    }

    // ── GATE: server-authoritative (uses DB tallies, never client input) ──
    const rentAfter    = t.payeLoyer + submittedRent
    const cautionAfter = (t.cautionPercue - t.cautionRendue) + submittedCaution
    if (rentAfter < t.total || cautionAfter < t.cautionAttendue) {
      const parts: string[] = []
      if (rentAfter < t.total) {
        parts.push(`Loyer restant à régler: ${Math.max(0, t.total - rentAfter)} DZD.`)
      }
      if (cautionAfter < t.cautionAttendue) {
        parts.push(`Caution restante à percevoir: ${Math.max(0, t.cautionAttendue - cautionAfter)} DZD.`)
      }
      throw new ApiError(400, parts.join(' '))
    }

    // ── Insert payments → flip status → rollback on failure ────
    const insertedIds: string[] = []
    const insertedRows: Array<{
      id: string; type: string; amount: number; method: string
      reference: string | null; notes: string | null
      receipt_url: string | null; created_at: string
    }> = []

    try {
      for (const v of validated) {
        const row = await insertRentalPayment(ctx.authSb, {
          rentalId:   id,
          type:       v.type,
          amount:     v.amount,
          method:     v.method,
          reference:  v.reference,
          notes:      v.notes,
          receiptUrl: v.receiptUrl,
          createdBy:  ctx.user.id,
        })
        insertedIds.push(row.id)
        insertedRows.push(row)
      }

      const { data: updated, error: updErr } = await ctx.authSb
        .from('rentals')
        .update({ status: 'active' })
        .eq('id', id)
        .eq('status', 'confirmed')
        .select('id, contract_number, status')
        .maybeSingle()

      if (updErr || !updated) {
        if (insertedIds.length) {
          await ctx.authSb.from('rental_payments').delete().in('id', insertedIds)
        }
        throw new ApiError(
          409,
          'La récupération a échoué (le contrat a changé de statut). Aucun paiement conservé.',
        )
      }

      // Best-effort audit trail (Chantier 3) — never fails the pickup. Safe
      // inside the try: logRentalActivity swallows its own errors and never
      // throws, so it can't trigger the payment rollback below.
      const logParts: string[] = []
      if (submittedRent > 0)    logParts.push(`Loyer ${formatDZD(submittedRent)}`)
      if (submittedCaution > 0) logParts.push(`Caution ${formatDZD(submittedCaution)}`)
      const summary = logParts.length ? ' — ' + logParts.join(' · ') : ' — déjà réglé'
      await logRentalActivity(ctx.authSb, {
        showroomId: t.rental.showroom_id,
        rentalId:   id,
        actorId:    ctx.user.id,
        type:       'picked_up',
        title:      `Voiture récupérée${summary}`,
      })

      return NextResponse.json(
        { rental: updated, payments: insertedRows },
        { status: 201 },
      )
    } catch (innerErr) {
      // Insert mid-failure (or the manual throw above) → roll back what we
      // already inserted so we never leave orphaned payments on a contract
      // that didn't transition.
      if (insertedIds.length) {
        try { await ctx.authSb.from('rental_payments').delete().in('id', insertedIds) }
        catch { /* best-effort */ }
      }
      throw innerErr
    }
  } catch (err) {
    return errorResponse(err)
  }
}
