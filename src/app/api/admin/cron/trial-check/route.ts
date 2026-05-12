// ─────────────────────────────────────────────────────────────────────
// GET /api/admin/cron/trial-check
// ─────────────────────────────────────────────────────────────────────
// Nightly job that does three things, in order:
//
//   STEP A — Disable expired trials
//     For every showroom WHERE is_trial=true AND active=true AND
//     trial_ends_at < now() : set active=false. The owner can no longer
//     log in (the dashboard layout / middleware also gate on `active`).
//
//   STEP B — J-1 reminder
//     For trials that expire tomorrow (trial_ends_at::date = tomorrow),
//     email the owner and CC the AutoDex internal inbox with a "expires
//     tomorrow" notice.
//
//   STEP C — J-3 reminder
//     Same as B but for trials expiring in 3 days, with the J-3 template.
//
// Returns counts of how many showrooms were processed in each step.
//
// ── Auth ──
// This route is hit by Vercel Cron (or any external scheduler). It
// requires:
//   Authorization: Bearer <CRON_SECRET>
// where CRON_SECRET is a server-only env var. Anything else returns 401.
//
// REQUIRED ENV VARS (set in Vercel → Project Settings → Environment Variables):
//   CRON_SECRET                    — random secret string
//   SUPABASE_SERVICE_ROLE_KEY     — service role key (bypasses RLS)
//   RESEND_API_KEY                 — for outgoing emails
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendEmail, internalNotifyAddress,
  trialJ1Email, trialJ3Email,
  formatDateFr,
} from '@/lib/resend'

export const runtime = 'nodejs'

type ShowroomLite = { id: string; name: string; trial_ends_at: string | null }

// Format a Date as 'YYYY-MM-DD' in UTC. We compare against trial_ends_at
// truncated to date (postgres `::date` semantics) so day boundaries are
// consistent regardless of server timezone.
function dayKeyUtc(d: Date): string {
  const yy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET non configuré.' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') ?? ''
  const presented = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : ''
  if (!presented || !constantTimeEqual(presented, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquant.' }, { status: 500 })
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const now = new Date()

  // ── STEP A — Disable expired trials ────────────────────────────────
  const { data: expiredRows, error: expErr } = await admin
    .from('showrooms')
    .select('id, name, trial_ends_at')
    .eq('is_trial', true)
    .eq('active', true)
    .lt('trial_ends_at', now.toISOString())
  if (expErr) {
    return NextResponse.json({ error: expErr.message }, { status: 500 })
  }

  const disabled: Array<{ id: string; name: string }> = []
  for (const s of (expiredRows ?? []) as ShowroomLite[]) {
    const { error } = await admin
      .from('showrooms')
      .update({ active: false })
      .eq('id', s.id)
    if (!error) disabled.push({ id: s.id, name: s.name })
    else console.warn(`[cron] failed to disable showroom ${s.id}:`, error.message)
  }

  // ── Helper: pull trials whose trial_ends_at falls on a given UTC day,
  // alongside the owner email (resolved via auth.users). We keep the SQL
  // trip simple by querying the date-window in JS — OK while the trial
  // population is small.
  async function trialsEndingOn(dayKey: string): Promise<Array<ShowroomLite & { owner_email: string | null }>> {
    const start = `${dayKey}T00:00:00.000Z`
    const end   = `${dayKey}T23:59:59.999Z`

    const { data: rows, error } = await admin
      .from('showrooms')
      .select('id, name, trial_ends_at')
      .eq('is_trial', true)
      .eq('active', true)
      .gte('trial_ends_at', start)
      .lte('trial_ends_at', end)
    if (error || !rows || rows.length === 0) return []

    // Resolve owner emails for these showrooms.
    const ids = rows.map(r => r.id as string)
    const { data: owners, error: oErr } = await admin
      .from('user_roles')
      .select('user_id, showroom_id')
      .in('showroom_id', ids)
      .eq('role', 'owner')
    if (oErr) {
      console.warn('[cron] owner lookup failed:', oErr.message)
      return rows.map(r => ({ ...(r as ShowroomLite), owner_email: null }))
    }

    // Resolve auth emails (paginated).
    const wantedUserIds = new Set((owners ?? []).map(o => o.user_id as string))
    const emailById = new Map<string, string | null>()
    for (let page = 1; page <= 5 && emailById.size < wantedUserIds.size; page++) {
      const { data, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (lErr) {
        console.warn('[cron] listUsers failed:', lErr.message)
        break
      }
      for (const u of data.users) if (wantedUserIds.has(u.id)) emailById.set(u.id, u.email ?? null)
      if (data.users.length < 200) break
    }
    const ownerEmailByShowroom = new Map<string, string | null>()
    for (const o of (owners ?? [])) {
      const email = emailById.get(o.user_id as string) ?? null
      // First-write-wins — there's a unique-on-user_id, so realistically
      // one owner per user_roles, but a showroom could in theory have
      // multiple owners; we pick the first non-null email.
      if (!ownerEmailByShowroom.has(o.showroom_id as string)) {
        ownerEmailByShowroom.set(o.showroom_id as string, email)
      } else if (email && !ownerEmailByShowroom.get(o.showroom_id as string)) {
        ownerEmailByShowroom.set(o.showroom_id as string, email)
      }
    }

    return rows.map(r => ({
      ...(r as ShowroomLite),
      owner_email: ownerEmailByShowroom.get(r.id as string) ?? null,
    }))
  }

  // ── STEP B — J-1 reminder ──────────────────────────────────────────
  const tomorrow = new Date(now); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const j1List   = await trialsEndingOn(dayKeyUtc(tomorrow))
  let j1_sent    = 0
  for (const s of j1List) {
    const endsFr = s.trial_ends_at ? formatDateFr(s.trial_ends_at) : ''
    const tpl    = trialJ1Email({ showroomName: s.name, endsAtFr: endsFr })
    const recipients: string[] = [internalNotifyAddress()]
    if (s.owner_email) recipients.unshift(s.owner_email)
    const r = await sendEmail({
      to:      recipients,
      subject: tpl.subject,
      text:    tpl.text,
      html:    tpl.html,
    })
    if (r.ok) j1_sent++
    else console.warn(`[cron] J-1 send failed for ${s.id}:`, r.error)
  }

  // ── STEP C — J-3 reminder ──────────────────────────────────────────
  const inThreeDays = new Date(now); inThreeDays.setUTCDate(inThreeDays.getUTCDate() + 3)
  const j3List      = await trialsEndingOn(dayKeyUtc(inThreeDays))
  let j3_sent       = 0
  for (const s of j3List) {
    const endsFr = s.trial_ends_at ? formatDateFr(s.trial_ends_at) : ''
    const tpl    = trialJ3Email({ showroomName: s.name, endsAtFr: endsFr })
    const recipients: string[] = [internalNotifyAddress()]
    if (s.owner_email) recipients.unshift(s.owner_email)
    const r = await sendEmail({
      to:      recipients,
      subject: tpl.subject,
      text:    tpl.text,
      html:    tpl.html,
    })
    if (r.ok) j3_sent++
    else console.warn(`[cron] J-3 send failed for ${s.id}:`, r.error)
  }

  // ── STEP D — Nightly lead temperature refresh ──────────────────────
  // Recompute hot/warm/cold buckets for every active showroom so values
  // stay accurate even if no owner clicks "Actualiser". Leads with
  // manual_temperature_override = true and closed leads are skipped by
  // the refresh_lead_temperatures(uuid) function.
  let temperatures_refreshed = 0
  const temperature_errors: Array<{ showroom_id: string; error: string }> = []
  {
    const { data: actives, error: activeErr } = await admin
      .from('showrooms')
      .select('id')
      .eq('active', true)
    if (activeErr) {
      console.warn('[cron] STEP D: failed to list active showrooms:', activeErr.message)
    } else {
      for (const s of (actives ?? []) as Array<{ id: string }>) {
        const { error: rpcErr } = await admin.rpc('refresh_lead_temperatures', {
          p_showroom_id: s.id,
        })
        if (rpcErr) {
          temperature_errors.push({ showroom_id: s.id, error: rpcErr.message })
          console.warn(`[cron] STEP D: refresh failed for ${s.id}:`, rpcErr.message)
        } else {
          temperatures_refreshed++
        }
      }
    }
  }

  // ── STEP E — Hot lead alerts ───────────────────────────────────────
  // For each chaud lead that:
  //   • hasn't been alerted yet (hot_alert_sent = false)
  //   • hasn't been contacted in 2h (or never, but created > 2h ago)
  //   • isn't closed (vendu/perdu/annule/reserve)
  // → insert a notification (type='lead_ignored', deduped via dedupe_key)
  //   and email the owner. Flip hot_alert_sent = true so we don't spam.
  // Resets back to false on the next contact-type activity (trigger).
  let hot_alerts_sent = 0
  {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data: hotLeads, error: hotErr } = await admin
      .from('leads')
      .select('id, full_name, phone, showroom_id, last_contacted_at, created_at, suivi')
      .eq('temperature', 'chaud')
      .eq('hot_alert_sent', false)
      .lt('created_at', twoHoursAgo)
    if (hotErr) {
      console.warn('[cron] STEP E: failed to list hot leads:', hotErr.message)
    } else {
      // Group leads by showroom so we can do one owner-email lookup per
      // showroom rather than per lead.
      const showroomIds = [...new Set((hotLeads ?? []).map(l => l.showroom_id).filter(Boolean) as string[])]
      const ownerByShowroom = new Map<string, string | null>()
      if (showroomIds.length > 0) {
        const { data: sr } = await admin
          .from('showrooms')
          .select('id, owner_email')
          .in('id', showroomIds)
        for (const s of (sr ?? []) as Array<{ id: string; owner_email: string | null }>) {
          ownerByShowroom.set(s.id, s.owner_email ?? null)
        }
      }

      for (const l of (hotLeads ?? []) as Array<{
        id: string; full_name: string | null; phone: string | null;
        showroom_id: string | null; last_contacted_at: string | null;
        created_at: string; suivi: string | null;
      }>) {
        // Filter closed leads server-side (PostgREST .not('suivi','in', ...) is
        // awkward — easier in JS).
        if (l.suivi && ['vendu','perdu','annule','reserve'].includes(l.suivi)) continue
        // Final check: last_contacted_at NULL or > 2h ago.
        if (l.last_contacted_at && new Date(l.last_contacted_at).getTime() > Date.parse(twoHoursAgo)) {
          continue
        }
        if (!l.showroom_id) continue

        const sinceMs = Date.now() - new Date(l.last_contacted_at ?? l.created_at).getTime()
        const sinceHours = Math.max(2, Math.round(sinceMs / 3_600_000))

        // 1) Notification (idempotent via dedupe_key — reset by the
        //    activities trigger when contact is logged, but the unique
        //    key prevents duplicate rows in the same cold window).
        await admin.from('notifications').insert([{
          showroom_id: l.showroom_id,
          type:        'lead_ignored',
          title:       '🔥 Lead chaud en attente !',
          message:     `${l.full_name ?? 'Un lead chaud'} attend un contact depuis ${sinceHours}h. Rappelle-le !`,
          lead_id:     l.id,
          dedupe_key:  `hot_alert:${l.id}:${new Date().toISOString().slice(0, 10)}`,
        }]).then(() => {}, () => {})

        // 2) Best-effort owner email.
        const owner = ownerByShowroom.get(l.showroom_id) ?? null
        if (owner) {
          await sendEmail({
            to:      owner,
            subject: `🔥 Lead chaud en attente — ${l.full_name ?? ''}`.trim(),
            text:
`Un lead chaud attend un contact :

Nom        : ${l.full_name ?? '—'}
Téléphone  : ${l.phone ?? '—'}
Sans contact depuis : ${sinceHours}h

Rappelez-le rapidement — chaque heure compte.

— AutoDex`,
          }).catch(() => {})
        }

        // 3) Flip the gate.
        await admin.from('leads').update({ hot_alert_sent: true }).eq('id', l.id).then(() => {}, () => {})
        hot_alerts_sent++
      }
    }
  }

  return NextResponse.json({
    disabled: disabled.length,
    disabled_showrooms: disabled,
    j1_sent,
    j3_sent,
    temperatures_refreshed,
    temperature_errors: temperature_errors.length ? temperature_errors : undefined,
    hot_alerts_sent,
  })
}
