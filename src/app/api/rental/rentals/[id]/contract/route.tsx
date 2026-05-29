// ─────────────────────────────────────────────────────────────────────
// GET /api/rental/rentals/[id]/contract
// ─────────────────────────────────────────────────────────────────────
// Streams a generated French A4 PDF rental contract for one rental, for
// ANY status (À confirmer → Annulé). Auth via requireShowroomMember; a
// closer may only fetch contracts assigned to self (404 otherwise so we
// never leak existence). Optional customer fields are rendered defensively
// by the PDF document (never prints "undefined"/"null").
//
// Runtime is Node (renderToBuffer from @react-pdf/renderer needs Node).
// ─────────────────────────────────────────────────────────────────────

import { type NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { ApiError, errorResponse, requireShowroomMember } from '@/lib/api-auth'
import { toNum } from '@/components/rental/booking/types'
import { RentalContractDocument, type ContractPdfData } from '@/lib/rental/contract-pdf'

export const runtime = 'nodejs'

type RouteCtx = { params: Promise<{ id: string }> }

const ALLOWED_ROLES = new Set(['owner', 'manager', 'closer', 'super_admin'])

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

type VehicleEmbed = {
  marque: string; modele: string; annee: number | null
  immatriculation: string; daily_rate: string | number | null
}
type CustomerEmbed = {
  full_name: string; phone: string | null
  cin_number: string | null; permis_number: string | null
  address: string | null; wilaya: string | null; date_naissance: string | null
}
type RawRental = {
  id: string; showroom_id: string; assigned_to: string | null
  contract_number: string | null; status: string
  start_date: string; start_time: string | null; end_date: string; end_time: string | null
  duration_days: string | number | null
  total_rental_amount: string | number | null
  deposit_amount: string | number | null
  rental_vehicle: VehicleEmbed | VehicleEmbed[] | null
  customer: CustomerEmbed | CustomerEmbed[] | null
}

export async function GET(req: NextRequest, { params }: RouteCtx) {
  try {
    const ctx = await requireShowroomMember(req)
    if (!ctx.showroomId && !ctx.isSuperAdmin) {
      throw new ApiError(403, 'Aucun showroom associé à votre compte.')
    }
    if (!ALLOWED_ROLES.has(ctx.role)) throw new ApiError(403, 'Accès refusé.')

    const { id } = await params
    if (!id) throw new ApiError(400, 'id requis.')

    // RLS-scoped load with vehicle + customer embeds.
    const { data: rentalRaw, error: loadErr } = await ctx.authSb
      .from('rentals')
      .select(
        'id, showroom_id, assigned_to, contract_number, status, start_date, start_time, end_date, end_time, ' +
        'duration_days, total_rental_amount, deposit_amount, ' +
        'rental_vehicle:rental_vehicles(marque, modele, annee, immatriculation, daily_rate), ' +
        'customer:rental_customers(full_name, phone, cin_number, permis_number, address, wilaya, date_naissance)',
      )
      .eq('id', id)
      .maybeSingle()
    if (loadErr) throw new ApiError(500, loadErr.message)

    const rental = (rentalRaw ?? null) as unknown as RawRental | null
    if (!rental) throw new ApiError(404, 'Contrat introuvable.')
    if (!ctx.isSuperAdmin && rental.showroom_id !== ctx.showroomId) {
      throw new ApiError(404, 'Contrat introuvable.')
    }
    if (ctx.role === 'closer' && rental.assigned_to !== ctx.user.id) {
      throw new ApiError(404, 'Contrat introuvable.')
    }

    // Showroom header info (name/city/address/phone — no wilaya column).
    const { data: showroomRow } = await ctx.authSb
      .from('showrooms')
      .select('name, city, address, phone')
      .eq('id', rental.showroom_id)
      .maybeSingle()

    const veh  = firstOf(rental.rental_vehicle)
    const cust = firstOf(rental.customer)

    const pdfData: ContractPdfData = {
      contractNumber: rental.contract_number ?? null,
      showroom: {
        name:    (showroomRow?.name as string | undefined) ?? 'Showroom',
        city:    (showroomRow?.city as string | null) ?? null,
        address: (showroomRow?.address as string | null) ?? null,
        phone:   (showroomRow?.phone as string | null) ?? null,
      },
      customer: cust ? {
        full_name:      cust.full_name,
        phone:          cust.phone ?? null,
        cin_number:     cust.cin_number ?? null,
        permis_number:  cust.permis_number ?? null,
        address:        cust.address ?? null,
        wilaya:         cust.wilaya ?? null,
        date_naissance: cust.date_naissance ?? null,
      } : null,
      vehicle: veh ? {
        marque:          veh.marque,
        modele:          veh.modele,
        annee:           veh.annee ?? null,
        immatriculation: veh.immatriculation,
        daily_rate:      veh.daily_rate == null ? null : toNum(veh.daily_rate),
      } : null,
      period: {
        start_date:    rental.start_date,
        start_time:    rental.start_time ?? null,
        end_date:      rental.end_date,
        end_time:      rental.end_time ?? null,
        duration_days: toNum(rental.duration_days),
      },
      amounts: {
        total:   rental.total_rental_amount == null ? null : toNum(rental.total_rental_amount),
        deposit: rental.deposit_amount == null ? null : toNum(rental.deposit_amount),
      },
    }

    const buffer = await renderToBuffer(<RentalContractDocument data={pdfData} />)
    const filename = `contrat-${(rental.contract_number ?? rental.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
