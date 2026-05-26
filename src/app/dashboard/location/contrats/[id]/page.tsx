// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/contrats/[id] — rental contract detail.
// ─────────────────────────────────────────────────────────────────────
// Server component: resolves role + showroom, fetches one rental with its
// vehicle + customer + payments, signs the private signature/vehicle photos,
// and renders the client detail (view + edit + payments). A closer may only
// open contracts assigned to self (mirrors the list rule). Financials
// (money figures + payments) are gated to owner/manager/super_admin.
// ─────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import ContractDetail, {
  type ContractDetailData, type ContractPayment,
} from '@/components/rental/ContractDetail'
import { toNum } from '@/components/rental/booking/types'

type RouteCtx = { params: Promise<{ id: string }> }

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

type VehicleEmbed = {
  marque: string; modele: string; annee: number | null; immatriculation: string
  daily_rate: string | number | null; deposit_amount: string | number | null; photos_urls: string[] | null
}
type CustomerEmbed = {
  full_name: string; phone: string; cin_number: string | null; permis_number: string | null; permis_expiry: string | null
}
type RawRental = {
  id: string; showroom_id: string; assigned_to: string | null
  contract_number: string | null; status: string
  start_date: string; start_time: string; end_date: string; end_time: string
  duration_days: string | number | null
  daily_rate_snapshot: string | number | null
  total_rental_amount: string | number | null
  deposit_amount: string | number | null
  notes: string | null; cancellation_reason: string | null
  signed_at: string | null; signature_url: string | null
  rental_vehicle_id: string
  rental_vehicle: VehicleEmbed | VehicleEmbed[] | null
  customer: CustomerEmbed | CustomerEmbed[] | null
}

export default async function Page({ params }: RouteCtx) {
  const { id } = await params
  const cookieStore = await cookies()
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) notFound()

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() { return cookieStore.getAll().map(({ name, value }) => ({ name, value })) },
      setAll() {},
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/dashboard/location/contrats/${id}`)

  const { data: roleRow } = await supabase
    .from('user_roles').select('role, showroom_id').eq('user_id', user.id).maybeSingle()
  const role = (roleRow?.role as string | undefined) ?? null
  if (role !== 'owner' && role !== 'manager' && role !== 'closer' && role !== 'super_admin') {
    redirect('/dashboard/location')
  }
  const showroomId = (roleRow?.showroom_id as string | null) ?? null
  const isSuperAdmin = role === 'super_admin'
  const canFin = role === 'owner' || role === 'manager' || isSuperAdmin

  // Fetch the rental (RLS-scoped) with vehicle + customer joins.
  const { data: rentalRaw } = await supabase
    .from('rentals')
    .select(
      'id, showroom_id, assigned_to, contract_number, status, start_date, start_time, end_date, end_time, ' +
      'duration_days, daily_rate_snapshot, total_rental_amount, deposit_amount, notes, cancellation_reason, ' +
      'signed_at, signature_url, rental_vehicle_id, ' +
      'rental_vehicle:rental_vehicles(marque, modele, annee, immatriculation, daily_rate, deposit_amount, photos_urls), ' +
      'customer:rental_customers(full_name, phone, cin_number, permis_number, permis_expiry)',
    )
    .eq('id', id)
    .maybeSingle()

  const rental = (rentalRaw ?? null) as unknown as RawRental | null
  if (!rental) notFound()
  if (!isSuperAdmin && rental.showroom_id !== showroomId) notFound()
  if (role === 'closer' && rental.assigned_to !== user.id) notFound()

  const veh = firstOf(rental.rental_vehicle)
  const cust = firstOf(rental.customer)

  // Sign private images (rental-documents bucket) via the caller's client —
  // RLS allows reading the user's own showroom folder.
  let signatureUrl: string | null = null
  if (rental.signature_url) {
    const { data: s } = await supabase.storage
      .from('rental-documents').createSignedUrl(String(rental.signature_url), 3600)
    signatureUrl = s?.signedUrl ?? null
  }
  let photos: string[] = []
  const photoPaths = veh?.photos_urls ?? []
  if (photoPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from('rental-documents').createSignedUrls(photoPaths, 3600)
    photos = (signed ?? []).map((x) => x.signedUrl).filter((u): u is string => !!u)
  }

  // Payments — only for users allowed to see financials.
  let payments: ContractPayment[] = []
  if (canFin) {
    const { data: pays } = await supabase
      .from('rental_payments')
      .select('id, type, amount, method, reference, notes, receipt_url, created_at')
      .eq('rental_id', id)
      .order('created_at', { ascending: false })
    payments = (pays ?? []).map((p) => ({
      id: p.id as string,
      type: p.type as string,
      amount: toNum(p.amount),
      method: p.method as string,
      reference: (p.reference as string | null) ?? null,
      notes: (p.notes as string | null) ?? null,
      receipt_url: (p.receipt_url as string | null) ?? null,
      created_at: p.created_at as string,
    }))
  }

  const data: ContractDetailData = {
    id: rental.id as string,
    contract_number: (rental.contract_number as string | null) ?? null,
    status: rental.status as string,
    start_date: rental.start_date as string,
    start_time: (rental.start_time as string) ?? '09:00',
    end_date: rental.end_date as string,
    end_time: (rental.end_time as string) ?? '18:00',
    duration_days: toNum(rental.duration_days),
    daily_rate_snapshot: toNum(rental.daily_rate_snapshot),
    total_rental_amount: toNum(rental.total_rental_amount),
    deposit_amount: toNum(rental.deposit_amount),
    notes: (rental.notes as string | null) ?? null,
    cancellation_reason: (rental.cancellation_reason as string | null) ?? null,
    signed_at: (rental.signed_at as string | null) ?? null,
    signatureUrl,
    rental_vehicle_id: rental.rental_vehicle_id as string,
    vehicle: veh ? {
      marque: veh.marque,
      modele: veh.modele,
      annee: veh.annee ?? null,
      immatriculation: veh.immatriculation,
      daily_rate: toNum(veh.daily_rate),
      photos,
    } : null,
    customer: cust ? {
      full_name: cust.full_name,
      phone: cust.phone,
      cin_number: cust.cin_number ?? null,
      permis_number: cust.permis_number ?? null,
      permis_expiry: cust.permis_expiry ?? null,
    } : null,
    payments,
  }

  // Per-showroom minimum deposit % (migration_47) for the reserve dialog; 5% fallback.
  const { data: settingsRow } = await supabase
    .from('rental_settings')
    .select('deposit_min_percent')
    .eq('showroom_id', rental.showroom_id)
    .maybeSingle()
  const depositMinPercent = Math.min(100, Math.max(5, Number(settingsRow?.deposit_min_percent ?? 5) || 5))

  return <ContractDetail data={data} canFin={canFin} depositMinPercent={depositMinPercent} />
}
