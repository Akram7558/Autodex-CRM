// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/prospects — rental prospects pipeline.
// ─────────────────────────────────────────────────────────────────────
// Server component: resolves role + showroom, fetches the showroom's
// rental_prospects (LEFT JOIN rental_vehicles for the requested car, and
// the converted contract's number when set), order created_at desc, limit
// 100 → client list (single status filter + actions). SEPARATE from sales
// prospects. Gated by middleware (ROUTE_ACL: /dashboard/location →
// owner/manager/closer/super_admin) and RLS.
// ─────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import RentalProspectsList, { type ProspectRow } from '@/components/rental/RentalProspectsList'

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

type VehicleEmbed = { marque: string; modele: string; annee: number | null }
type ConvertedEmbed = { contract_number: string | null }
type RawRow = {
  id: string
  full_name: string
  phone: string
  desired_start_date: string | null
  desired_end_date: string | null
  reason: string
  reason_other: string | null
  message: string | null
  status: string
  converted_rental_id: string | null
  rental_vehicle_id: string | null
  created_at: string
  rental_vehicle: VehicleEmbed | VehicleEmbed[] | null
  converted: ConvertedEmbed | ConvertedEmbed[] | null
}

export default async function Page() {
  const cookieStore = await cookies()
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return <RentalProspectsList initialRows={[]} />

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() { return cookieStore.getAll().map(({ name, value }) => ({ name, value })) },
      setAll() {},
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard/location/prospects')

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role, showroom_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const role = (roleRow?.role as string | undefined) ?? null
  if (role !== 'owner' && role !== 'manager' && role !== 'closer' && role !== 'super_admin') {
    redirect('/dashboard/location')
  }
  const showroomId = (roleRow?.showroom_id as string | null) ?? null
  // Only owner/manager/super_admin may bulk-trash cancelled (perdue) demandes
  // (closer is excluded, mirroring the trash endpoint's role guard).
  const canTrash = role === 'owner' || role === 'manager' || role === 'super_admin'

  let q = supabase
    .from('rental_prospects')
    .select(
      'id, full_name, phone, desired_start_date, desired_end_date, reason, reason_other, ' +
      'message, status, converted_rental_id, rental_vehicle_id, created_at, ' +
      'rental_vehicle:rental_vehicles(marque, modele, annee), ' +
      'converted:rentals(contract_number)',
    )
    // Chantier 4: a prospect linked to a contract (converted_rental_id set)
    // has MOVED to the Contrats section — hide it from the pipeline (and from
    // the filter counts, which are derived client-side from these rows).
    .is('converted_rental_id', null)
    // rdv_planifie prospects have moved into Contrats (or await the booking
    // wizard) — hide them from the pipeline entirely, like convertie. Net set
    // here: nouvelle / tentative_1-3 / reporter / perdue.
    .neq('status', 'rdv_planifie')
    // Soft-delete (corbeille, migration 51): trashed prospects carry a
    // deleted_at timestamp and must never appear in the list or its derived
    // counts. NULL = not trashed.
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100)
  if (showroomId) q = q.eq('showroom_id', showroomId)

  const { data } = await q
  const raw = (data ?? []) as unknown as RawRow[]
  const rows: ProspectRow[] = raw.map((r) => ({
    id:                  r.id,
    full_name:           r.full_name,
    phone:               r.phone,
    desired_start_date:  r.desired_start_date ?? null,
    desired_end_date:    r.desired_end_date ?? null,
    reason:              r.reason,
    reason_other:        r.reason_other ?? null,
    message:             r.message ?? null,
    status:              r.status,
    converted_rental_id: r.converted_rental_id ?? null,
    rental_vehicle_id:   r.rental_vehicle_id ?? null,
    created_at:          r.created_at,
    vehicle:             firstOf(r.rental_vehicle),
    contract_number:     firstOf(r.converted)?.contract_number ?? null,
  }))

  return <RentalProspectsList initialRows={rows} canTrash={canTrash} />
}
