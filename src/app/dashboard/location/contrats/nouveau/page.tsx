// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/contrats/nouveau — booking wizard route.
// ─────────────────────────────────────────────────────────────────────
// Server component: with ?from_prospect=<id> it fetches that rental
// prospect (showroom-scoped) and resolves the requested vehicle, building a
// prefill the client wizard seeds from. Without it, the wizard opens empty
// (the normal "Nouvelle location" flow — unchanged). Gated by middleware
// (ROUTE_ACL: /dashboard/location → owner/manager/closer/super_admin) + RLS.
// ─────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import BookingWizard from '@/components/rental/booking/BookingWizard'
import {
  toNum, type WizardPrefill, type RentalVehicleLite, type RentalCustomerLite,
} from '@/components/rental/booking/types'
import { findOrCreateRentalCustomer } from '@/lib/rental/customers'

// `rdv=1` is set by the "RDV planifié" flow when the prospect lacked a
// vehicle/dates and fell through to the wizard — informational only; the
// prospect link (status='rdv_planifie' + converted_rental_id) is applied
// server-side by POST /api/rental/rentals from `from_prospect_id`.
type RouteCtx = { searchParams: Promise<{ from_prospect?: string; rdv?: string }> }

type RawVehicle = {
  id: string
  marque: string
  modele: string
  annee: number | null
  immatriculation: string
  daily_rate: string | number | null
  weekly_rate: string | number | null
  monthly_rate: string | number | null
  deposit_amount: string | number | null
  photos_urls: string[] | null
  is_active: boolean
}

export default async function Page({ searchParams }: RouteCtx) {
  const { from_prospect } = await searchParams
  if (!from_prospect) {
    // Normal flow — no prefill.
    return <BookingWizard />
  }

  const cookieStore = await cookies()
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return <BookingWizard />

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() { return cookieStore.getAll().map(({ name, value }) => ({ name, value })) },
      setAll() {},
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/dashboard/location/contrats/nouveau?from_prospect=${from_prospect}`)

  // Fetch the prospect (RLS-scoped to the caller's showroom).
  const { data: prospect } = await supabase
    .from('rental_prospects')
    .select('id, showroom_id, status, rental_vehicle_id, full_name, phone, desired_start_date, desired_end_date, converted_rental_id')
    .eq('id', from_prospect)
    // Soft-delete (corbeille, migration 51): a trashed prospect must not be
    // loadable into the booking wizard.
    .is('deleted_at', null)
    .maybeSingle()

  // Unknown / out-of-showroom / already linked to a contract → empty wizard
  // (the converted_rental_id guard prevents creating a 2nd contract for a
  // prospect that already moved to Contrats).
  if (!prospect || prospect.status === 'convertie' || prospect.converted_rental_id) {
    return <BookingWizard />
  }

  // Resolve the requested vehicle if it still exists and is active.
  let vehicle: RentalVehicleLite | null = null
  let vehicleUnavailable = false
  if (prospect.rental_vehicle_id) {
    const { data: v } = await supabase
      .from('rental_vehicles')
      .select('id, marque, modele, annee, immatriculation, daily_rate, weekly_rate, monthly_rate, deposit_amount, photos_urls, is_active')
      .eq('id', prospect.rental_vehicle_id)
      .maybeSingle()
    const raw = v as RawVehicle | null
    if (raw && raw.is_active) {
      vehicle = {
        id:             raw.id,
        marque:         raw.marque,
        modele:         raw.modele,
        annee:          raw.annee ?? 0,
        immatriculation: raw.immatriculation,
        daily_rate:     toNum(raw.daily_rate),
        weekly_rate:    raw.weekly_rate == null ? null : toNum(raw.weekly_rate),
        monthly_rate:   raw.monthly_rate == null ? null : toNum(raw.monthly_rate),
        deposit_amount: toNum(raw.deposit_amount),
        photos_urls:    raw.photos_urls ?? [],
        is_active:      raw.is_active,
      }
    } else {
      vehicleUnavailable = true   // referenced a vehicle that's gone/inactive
    }
  }

  // ── Auto find-or-create the customer by phone (shared helper) ──
  // The prospect was RLS-scoped, so its showroom_id == the caller's showroom;
  // the authenticated client's insert passes rental_customers RLS. Phone is
  // already +213-normalized. Reuses the same helper as the RDV auto-schedule
  // route so the find-or-create logic lives in one place.
  const showroomId = prospect.showroom_id as string
  const custPhone  = ((prospect.phone as string | null) ?? '').trim()
  const custName   = ((prospect.full_name as string | null) ?? '').trim()

  const custRow = await findOrCreateRentalCustomer(supabase, showroomId, custPhone, custName)
  const customer: RentalCustomerLite | null = custRow
    ? {
        id:               custRow.id,
        full_name:        custRow.full_name,
        phone:            custRow.phone,
        blacklisted:      !!custRow.blacklisted,
        blacklist_reason: custRow.blacklist_reason ?? null,
      }
    : null

  const prefill: WizardPrefill = {
    fromProspectId:     prospect.id as string,
    vehicle,
    vehicleUnavailable,
    startDate:          (prospect.desired_start_date as string | null) ?? '',
    endDate:            (prospect.desired_end_date as string | null) ?? '',
    customer,
    customerName:       custName,
    customerPhone:      custPhone,
  }

  return <BookingWizard prefill={prefill} />
}
