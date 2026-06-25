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
  trialJ1Email, trialJ3Email, trialExpiredEmail,
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

  // ── Helper: resolve owner email per showroom id (user_roles role='owner'
  // → auth.users via paginated listUsers). Shared by the J-1/J-3 reminders
  // AND the STEP A expired-trial email so the lookup lives in one place.
  async function resolveOwnerEmails(ids: string[]): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>()
    if (ids.length === 0) return map
    const { data: owners, error: oErr } = await admin
      .from('user_roles')
      .select('user_id, showroom_id')
      .in('showroom_id', ids)
      .eq('role', 'owner')
    if (oErr) {
      console.warn('[cron] owner lookup failed:', oErr.message)
      return map
    }
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
    for (const o of (owners ?? [])) {
      const email = emailById.get(o.user_id as string) ?? null
      // First-write-wins; a showroom could in theory have multiple owners, so
      // we keep the first non-null email.
      if (!map.has(o.showroom_id as string)) map.set(o.showroom_id as string, email)
      else if (email && !map.get(o.showroom_id as string)) map.set(o.showroom_id as string, email)
    }
    return map
  }

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
  const disabledRows: ShowroomLite[] = []
  for (const s of (expiredRows ?? []) as ShowroomLite[]) {
    const { error } = await admin
      .from('showrooms')
      .update({ active: false })
      .eq('id', s.id)
    if (!error) { disabled.push({ id: s.id, name: s.name }); disabledRows.push(s) }
    else console.warn(`[cron] failed to disable showroom ${s.id}:`, error.message)
  }

  // Expired-trial email (best-effort). The disable above already happened, so
  // an email / owner-resolution failure NEVER blocks it. STEP A only selects
  // is_trial=true AND active=true — and we just flipped active=false — so a
  // disabled trial is never re-selected → this email fires exactly once.
  let expired_emails_sent = 0
  if (disabledRows.length > 0) {
    const ownerEmails = await resolveOwnerEmails(disabledRows.map(r => r.id))
    for (const s of disabledRows) {
      const endsFr = s.trial_ends_at ? formatDateFr(s.trial_ends_at) : ''
      const tpl    = trialExpiredEmail({ showroomName: s.name, endsAtFr: endsFr })
      const recipients: string[] = [internalNotifyAddress()]
      const ownerEmail = ownerEmails.get(s.id) ?? null
      if (ownerEmail) recipients.unshift(ownerEmail)
      const r = await sendEmail({ to: recipients, subject: tpl.subject, text: tpl.text, html: tpl.html })
      if (r.ok) expired_emails_sent++
      else console.warn(`[cron] expired send failed for ${s.id}:`, r.error)
    }
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

    const ownerEmailByShowroom = await resolveOwnerEmails(rows.map(r => r.id as string))
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

  // ── STEP F — Smart reminders + escalation (migration 34) ─────────
  // Temperature-aware thresholds for when a lead is overdue:
  //   chaud → 1 day · tiede → 3 days · froid → 7 days
  // Reminder cadence: at most 1 per 24h per lead, capped at 3.
  // Escalation: 24h after any reminder without contact, the owner +
  // every manager of the showroom get an "escalation" notification
  // (deduped per-lead).
  //
  // The reset side of the loop is handled by trg_activities_signal:
  // any contact-type activity sets reminder_count back to 0 and
  // clears escalated, so this step never re-fires once someone reaches
  // out to the lead.
  let reminders_sent     = 0
  let reminders_escalated = 0
  const CLOSED_SUIVI = ['vendu', 'perdu', 'annule', 'reserve']

  const DAY_MS  = 24 * 60 * 60 * 1000
  const NOW     = now.getTime()
  function staleThresholdMs(temp: string | null): number {
    if (temp === 'chaud') return 1 * DAY_MS
    if (temp === 'froid') return 7 * DAY_MS
    return 3 * DAY_MS // tiede / unknown
  }
  function daysSince(ts: string | null | undefined): number {
    if (!ts) return Infinity
    return Math.floor((NOW - new Date(ts).getTime()) / DAY_MS)
  }

  // Active showrooms — owner / manager directory for escalation.
  const { data: activeShowrooms } = await admin
    .from('showrooms')
    .select('id, name')
    .eq('active', true)

  for (const s of (activeShowrooms ?? []) as Array<{ id: string; name: string }>) {
    // ── Pull every candidate lead in one query (showroom-scoped). ──
    const { data: candidates, error: candErr } = await admin
      .from('leads')
      .select(
        'id, showroom_id, full_name, assigned_to, suivi, temperature, '
        + 'last_contacted_at, created_at, reminder_count, last_reminder_at, '
        + 'escalated, escalated_at',
      )
      .eq('showroom_id', s.id)
      .not('assigned_to', 'is', null)
    if (candErr) {
      console.warn(`[cron F] failed to list candidates for ${s.id}:`, candErr.message)
      continue
    }

    // Resolve owner + managers once per showroom for escalation.
    const { data: admins } = await admin
      .from('user_roles')
      .select('user_id, role')
      .eq('showroom_id', s.id)
      .in('role', ['owner', 'manager'])
    const adminIds = (admins ?? []).map((r) => r.user_id as string)

    for (const l of (candidates ?? []) as unknown as Array<{
      id: string
      showroom_id: string
      full_name: string | null
      assigned_to: string | null
      suivi: string | null
      temperature: string | null
      last_contacted_at: string | null
      created_at: string
      reminder_count: number | null
      last_reminder_at: string | null
      escalated: boolean | null
    }>) {
      if (l.suivi && CLOSED_SUIVI.includes(l.suivi)) continue
      if (!l.assigned_to) continue

      const lastContact = l.last_contacted_at ?? l.created_at
      const stale = NOW - new Date(lastContact).getTime() > staleThresholdMs(l.temperature)
      if (!stale) continue

      const reminderCount = l.reminder_count ?? 0
      const sinceLastReminderMs = l.last_reminder_at
        ? NOW - new Date(l.last_reminder_at).getTime()
        : Infinity

      // ── Reminder (cap at 3, max one per 24h) ────────────────────
      if (reminderCount < 3 && sinceLastReminderMs >= DAY_MS) {
        const nextCount = reminderCount + 1
        const days = daysSince(lastContact)
        const tempLabel = l.temperature === 'chaud' ? 'Chaud'
                       : l.temperature === 'froid' ? 'Froid'
                       : 'Tiède'
        const name = l.full_name ?? 'Ce lead'
        let title: string
        if (nextCount === 1) {
          title = `⏰ Relancez ${name} !`
        } else if (nextCount === 2) {
          title = `⚠️ ${name} attend toujours un contact`
        } else {
          title = `🚨 Dernier rappel — ${name} va refroidir`
        }
        const message =
          `Pas de contact depuis ${Number.isFinite(days) ? days : '—'} jour${days > 1 ? 's' : ''}. `
          + `Température : ${tempLabel}.`

        // Insert reminder first (deduped per (lead, count)); only bump
        // the lead counters if the insert actually happened, so we
        // can re-run the cron safely without losing reminders.
        const { error: insErr } = await admin
          .from('notifications')
          .insert([{
            showroom_id: l.showroom_id,
            user_id:     l.assigned_to,
            lead_id:     l.id,
            type:        'reminder',
            title,
            message,
            dedupe_key:  `reminder:${l.id}:${nextCount}`,
          }])
        if (!insErr) {
          await admin
            .from('leads')
            .update({
              reminder_count:   nextCount,
              last_reminder_at: now.toISOString(),
            })
            .eq('id', l.id)
            .then(() => {}, () => {})
          reminders_sent++
        } else if (!/duplicate|unique/i.test(insErr.message)) {
          console.warn(`[cron F] reminder insert failed for ${l.id}:`, insErr.message)
        }
      }

      // ── Escalation (≥1 reminder, 24h gone, still stale) ─────────
      if (
        !l.escalated &&
        reminderCount >= 1 &&
        sinceLastReminderMs >= DAY_MS &&
        adminIds.length > 0
      ) {
        const name = l.full_name ?? 'Ce lead'
        const days = daysSince(lastContact)
        const message =
          `L'employé assigné n'a pas relancé ${name} depuis ${Number.isFinite(days) ? days : '—'} jour${days > 1 ? 's' : ''} `
          + `malgré ${reminderCount} rappel${reminderCount > 1 ? 's' : ''}.`

        // One notification per admin, deduped by (lead, recipient).
        const rows = adminIds.map((adminId) => ({
          showroom_id: l.showroom_id,
          user_id:     adminId,
          lead_id:     l.id,
          type:        'escalation' as const,
          title:       `🔴 Escalade — ${name} non contacté`,
          message,
          dedupe_key:  `escalation:${l.id}:${adminId}`,
        }))
        const { error: escErr } = await admin.from('notifications').insert(rows)
        if (!escErr || /duplicate|unique/i.test(escErr.message)) {
          await admin
            .from('leads')
            .update({ escalated: true, escalated_at: now.toISOString() })
            .eq('id', l.id)
            .then(() => {}, () => {})
          reminders_escalated++
        } else {
          console.warn(`[cron F] escalation insert failed for ${l.id}:`, escErr.message)
        }
      }
    }
  }

  return NextResponse.json({
    disabled: disabled.length,
    disabled_showrooms: disabled,
    expired_emails_sent,
    j1_sent,
    j3_sent,
    temperatures_refreshed,
    temperature_errors: temperature_errors.length ? temperature_errors : undefined,
    hot_alerts_sent,
    reminders_sent,
    reminders_escalated,
  })
}
