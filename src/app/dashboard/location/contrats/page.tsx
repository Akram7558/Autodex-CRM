// ─────────────────────────────────────────────────────────────────────
// /dashboard/location/contrats — rental contracts list.
// ─────────────────────────────────────────────────────────────────────
// Server component: resolves role + showroom, fetches the showroom's
// rentals (closer → only their own assigned_to) joined with vehicle +
// customer, and hands them to the client list (tabs + status actions).
// Access is also gated by middleware (ROUTE_ACL: /dashboard/location →
// owner/manager/closer/super_admin) and RLS.
// ─────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import RentalContractsList, { type ContractRow } from '@/components/rental/RentalContractsList'

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

type VehicleEmbed = { marque: string; modele: string; annee: number | null }
type CustomerEmbed = { full_name: string; phone: string }
type RawRow = {
  id: string
  contract_number: string | null
  status: string
  start_date: string
  start_time: string | null
  end_date: string
  end_time: string | null
  duration_days: number | null
  total_rental_amount: number | null
  deposit_amount: number | null
  created_at: string
  rental_vehicle: VehicleEmbed | VehicleEmbed[] | null
  customer: CustomerEmbed | CustomerEmbed[] | null
}

export default async function Page() {
  const cookieStore = await cookies()
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return <RentalContractsList initialRows={[]} canFin={false} />

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() { return cookieStore.getAll().map(({ name, value }) => ({ name, value })) },
      setAll() {},
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/dashboard/location/contrats')

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
  // Financial roles may "Réserver" (record the mandatory deposit). Closers
  // don't take money, so the reserve action is hidden for them (consistent
  // with the payments/financials guard).
  const canFin = role === 'owner' || role === 'manager' || role === 'super_admin'

  // RLS already scopes to the showroom + (for closer) own rows; we mirror
  // the closer filter explicitly per the spec (assigned_to = self).
  let q = supabase
    .from('rentals')
    .select(
      'id, contract_number, status, start_date, start_time, end_date, end_time, ' +
      'duration_days, total_rental_amount, deposit_amount, created_at, ' +
      'rental_vehicle:rental_vehicles(marque, modele, annee), ' +
      'customer:rental_customers(full_name, phone)',
    )
    .order('created_at', { ascending: false })
    .limit(100)
  if (showroomId) q = q.eq('showroom_id', showroomId)
  if (role === 'closer') q = q.eq('assigned_to', user.id)

  const { data } = await q
  const raw = (data ?? []) as unknown as RawRow[]

  // Chantier 4: which of these contracts originated from a rental demande?
  // Fetch the showroom's prospect→contract links and badge matching rows.
  let rdvSet = new Set<string>()
  {
    let lq = supabase
      .from('rental_prospects')
      .select('converted_rental_id')
      .not('converted_rental_id', 'is', null)
    if (showroomId) lq = lq.eq('showroom_id', showroomId)
    const { data: links } = await lq
    rdvSet = new Set(
      (links ?? [])
        .map((l) => (l as { converted_rental_id: string | null }).converted_rental_id)
        .filter((v): v is string => !!v),
    )
  }

  const rows: ContractRow[] = raw.map((r) => ({
    id:                  r.id,
    contract_number:     r.contract_number ?? null,
    status:              r.status,
    start_date:          r.start_date,
    start_time:          r.start_time ?? null,
    end_date:            r.end_date,
    end_time:            r.end_time ?? null,
    duration_days:       Number(r.duration_days ?? 0),
    total_rental_amount: Number(r.total_rental_amount ?? 0),
    deposit_amount:      Number(r.deposit_amount ?? 0),
    created_at:          r.created_at,
    vehicle:             firstOf(r.rental_vehicle),
    customer:            firstOf(r.customer),
    isFromProspect:      rdvSet.has(r.id),
  }))

  // Per-showroom minimum deposit % (migration_47) for the reserve dialog; 5%
  // fallback. List-level (one value): correct for a tenant's single showroom;
  // for a super_admin spanning showrooms it's a best-effort prefill — the
  // reserve route re-validates with the correct per-rental showroom %.
  let depositMinPercent = 5
  if (showroomId) {
    const { data: settingsRow } = await supabase
      .from('rental_settings')
      .select('deposit_min_percent')
      .eq('showroom_id', showroomId)
      .maybeSingle()
    depositMinPercent = Math.min(100, Math.max(5, Number(settingsRow?.deposit_min_percent ?? 5) || 5))
  }

  return <RentalContractsList initialRows={rows} canFin={canFin} depositMinPercent={depositMinPercent} />
}
