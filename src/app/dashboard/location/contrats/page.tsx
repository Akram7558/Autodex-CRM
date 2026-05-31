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
import { getServerAuth } from '@/lib/server-auth'
import RentalContractsList, { type ContractRow, type PaymentRow, type ActivityRow } from '@/components/rental/RentalContractsList'
import { toNum } from '@/components/rental/booking/types'

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

type VehicleEmbed = { id: string; marque: string; modele: string; annee: number | null; immatriculation: string }
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

  // Auth deduped: identity/role/showroom come from the cached getServerAuth
  // (getSession-based — middleware already getUser()-validated this request),
  // so the page no longer pays the redundant getUser() network round-trip.
  const tAuth = performance.now()
  const { userId, role, showroomId } = await getServerAuth()
  console.log(`[perf] rental:contrats:auth ${(performance.now() - tAuth).toFixed(0)}ms`)
  if (role !== 'owner' && role !== 'manager' && role !== 'closer' && role !== 'super_admin') {
    redirect('/dashboard/location')
  }
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
      'rental_vehicle:rental_vehicles(id, marque, modele, annee, immatriculation), ' +
      'customer:rental_customers(full_name, phone)',
    )
    // Soft-delete (corbeille, migration 51): trashed contracts carry a
    // deleted_at timestamp and must never appear in the list or its derived
    // counts. NULL = not trashed.
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100)
  if (showroomId) q = q.eq('showroom_id', showroomId)
  if (role === 'closer') q = q.eq('assigned_to', userId)

  const { data } = await q
  const raw = (data ?? []) as unknown as RawRow[]

  // Chantier 2/3/4 + reserve settings: these four follow-up reads are all
  // independent of one another (and of the rows map below), so we fire them
  // concurrently and await once instead of four serial round-trips. Each
  // closure keeps its own role gating + filters intact. [perf] timer mirrors
  // the API-route convention.
  const tFollow = performance.now()
  const [rdvSet, paymentsByRental, activitiesByRental, depositMinPercent] = await Promise.all([
    // Chantier 4: which of these contracts originated from a rental demande?
    // Fetch the showroom's prospect→contract links and badge matching rows.
    (async (): Promise<Set<string>> => {
      let lq = supabase
        .from('rental_prospects')
        .select('converted_rental_id')
        .not('converted_rental_id', 'is', null)
      if (showroomId) lq = lq.eq('showroom_id', showroomId)
      const { data: links } = await lq
      return new Set(
        (links ?? [])
          .map((l) => (l as { converted_rental_id: string | null }).converted_rental_id)
          .filter((v): v is string => !!v),
      )
    })(),

    // Chantier 2 (step 2): pre-fetch payments for ALL rows in ONE query so each
    // expandable row can show its finance summary + payment history without a
    // per-row round-trip. Financial roles only (mirrors the fiche guard); RLS
    // already scopes to the showroom + closer-on-own.
    (async (): Promise<Map<string, PaymentRow[]>> => {
      const byRental = new Map<string, PaymentRow[]>()
      if (canFin && raw.length > 0) {
        const { data: pays } = await supabase
          .from('rental_payments')
          .select('rental_id, id, type, amount, method, reference, receipt_url, created_at')
          .in('rental_id', raw.map((r) => r.id))
          .order('created_at', { ascending: true })
        for (const p of (pays ?? []) as Record<string, unknown>[]) {
          const rid = String(p.rental_id)
          const arr = byRental.get(rid) ?? []
          arr.push({
            id:          (p.id as string | null) ?? null,
            type:        String(p.type),
            amount:      toNum(p.amount),
            method:      String(p.method),
            reference:   (p.reference as string | null) ?? null,
            receipt_url: (p.receipt_url as string | null) ?? null,
            created_at:  String(p.created_at),
          })
          byRental.set(rid, arr)
        }
      }
      return byRental
    })(),

    // Chantier 3: pre-fetch the activity log for ALL rows in ONE query so each
    // expandable row can show its timeline without a per-row round-trip. Financial
    // roles only (mirrors the payments prefetch + the fiche guard); RLS already
    // scopes to the showroom + closer-on-own. Newest-first; capped at 500 across
    // the page (per-contract slicing happens client-side).
    (async (): Promise<Map<string, ActivityRow[]>> => {
      const byRental = new Map<string, ActivityRow[]>()
      if (canFin && raw.length > 0) {
        const { data: acts } = await supabase
          .from('rental_activities')
          .select('rental_id, id, type, title, body, created_at, actor:users(full_name)')
          .in('rental_id', raw.map((r) => r.id))
          .order('created_at', { ascending: false })
          .limit(500)
        for (const a of (acts ?? []) as Record<string, unknown>[]) {
          const rid = String(a.rental_id)
          const arr = byRental.get(rid) ?? []
          const actorEmbed = Array.isArray(a.actor) ? a.actor[0] : a.actor
          arr.push({
            id:         String(a.id),
            type:       String(a.type),
            title:      String(a.title),
            body:       (a.body as string | null) ?? null,
            created_at: String(a.created_at),
            actor:      actorEmbed
              ? { full_name: String((actorEmbed as { full_name?: unknown }).full_name ?? '') }
              : null,
          })
          byRental.set(rid, arr)
        }
      }
      return byRental
    })(),

    // Per-showroom minimum deposit % (migration_47) for the reserve dialog; 5%
    // fallback. List-level (one value): correct for a tenant's single showroom;
    // for a super_admin spanning showrooms it's a best-effort prefill — the
    // reserve route re-validates with the correct per-rental showroom %.
    (async (): Promise<number> => {
      if (!showroomId) return 5
      const { data: settingsRow } = await supabase
        .from('rental_settings')
        .select('deposit_min_percent')
        .eq('showroom_id', showroomId)
        .maybeSingle()
      return Math.min(100, Math.max(5, Number(settingsRow?.deposit_min_percent ?? 5) || 5))
    })(),
  ])
  console.log(`[perf] rental:contrats:follow ${(performance.now() - tFollow).toFixed(0)}ms`)

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
    payments:            canFin ? (paymentsByRental.get(r.id) ?? []) : undefined,
    activities:          canFin ? (activitiesByRental.get(r.id) ?? []) : undefined,
  }))

  return <RentalContractsList initialRows={rows} canFin={canFin} depositMinPercent={depositMinPercent} />
}
