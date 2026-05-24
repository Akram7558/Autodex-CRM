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

type RouteCtx = { searchParams: Promise<{ from_prospect?: string }> }

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
    .select('id, showroom_id, status, rental_vehicle_id, full_name, phone, desired_start_date, desired_end_date')
    .eq('id', from_prospect)
    .maybeSingle()

  // Unknown / out-of-showroom / already converted → fall back to empty wizard.
  if (!prospect || prospect.status === 'convertie') {
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

  // ── Auto find-or-create the customer by phone (convert flow only) ──
  // The prospect was RLS-scoped, so its showroom_id == the caller's showroom;
  // the authenticated client's insert passes rental_customers RLS. Phone is
  // already +213-normalized. Handle the UNIQUE(showroom, phone) race by
  // re-selecting on insert failure.
  const showroomId = prospect.showroom_id as string
  const custPhone  = ((prospect.phone as string | null) ?? '').trim()
  const custName   = ((prospect.full_name as string | null) ?? '').trim()
  const custCols   = 'id, full_name, phone, blacklisted, blacklist_reason'

  type RawCustomer = { id: string; full_name: string; phone: string; blacklisted: boolean | null; blacklist_reason: string | null }
  const toLite = (c: RawCustomer): RentalCustomerLite => ({
    id: c.id, full_name: c.full_name, phone: c.phone,
    blacklisted: !!c.blacklisted, blacklist_reason: c.blacklist_reason ?? null,
  })

  let customer: RentalCustomerLite | null = null
  if (custPhone) {
    const { data: existing } = await supabase
      .from('rental_customers').select(custCols)
      .eq('showroom_id', showroomId).eq('phone', custPhone).maybeSingle()
    if (existing) {
      customer = toLite(existing as RawCustomer)
    } else {
      const { data: inserted } = await supabase
        .from('rental_customers')
        .insert([{ showroom_id: showroomId, full_name: custName || custPhone, phone: custPhone }])
        .select(custCols).maybeSingle()
      if (inserted) {
        customer = toLite(inserted as RawCustomer)
      } else {
        // UNIQUE(showroom, phone) race (or insert blocked) → re-select.
        const { data: again } = await supabase
          .from('rental_customers').select(custCols)
          .eq('showroom_id', showroomId).eq('phone', custPhone).maybeSingle()
        if (again) customer = toLite(again as RawCustomer)
      }
    }
  }

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
