// ─────────────────────────────────────────────────────────────
// Shared helpers for Meta webhook routes (WhatsApp, Messenger,
// Instagram). Signature verification + lead upsert logic.
// ─────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { LeadSource } from './types'
import { detectLeadFromMessage, type ExtractedLead } from './ai-lead-detector'
import { supaServer } from './integrations-utils'

// Single hardened service-role client for the whole codebase: it throws when
// SUPABASE_SERVICE_ROLE_KEY is missing instead of silently falling back to the
// anon key (which, post-RLS-hardening, would hit tenant denials and quietly
// drop inbound leads). Re-exported so existing webhook imports keep working.
export { supaServer }

// Meta sends `x-hub-signature-256: sha256=<hex>` with the raw body
// HMAC'd against the app secret. Returns true only on a match.
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET
  if (!secret) return false
  if (!header || !header.startsWith('sha256=')) return false
  const provided = header.slice('sha256='.length)
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  if (provided.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

// Meta webhook verification handshake (GET). Returns challenge string
// if the token matches, null otherwise.
export function verifyChallenge(url: URL, expectedToken: string | undefined): string | null {
  const mode      = url.searchParams.get('hub.mode')
  const token     = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token && token === expectedToken && challenge) {
    return challenge
  }
  return null
}

// Normalize Algerian phone numbers for duplicate-lead lookups.
// 0556123456, +213556123456, 213556123456 → +213556123456
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.startsWith('213')) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 10) return `+213${digits.slice(1)}`
  if (digits.length === 9 && /^[5-7]/.test(digits)) return `+213${digits}`
  return raw.startsWith('+') ? raw : `+${digits}`
}

// Provider values as stored in the `integrations.provider` column. NB: the
// webhook "platform" uses 'facebook' for Messenger, whereas the integration
// provider is 'messenger' — callers must pass the integration value here.
export type IntegrationProvider = 'whatsapp' | 'messenger' | 'instagram'

/**
 * Map an inbound Meta business-account id back to the showroom that owns it.
 *
 * The identifier is the webhook payload's top-level `entry.id`: the WhatsApp
 * Business Account (WABA) id for WhatsApp, the Page id for Messenger, the
 * Instagram account id for Instagram. That is exactly what the connect flow
 * persists into `integrations.account_id` (connect/whatsapp writes account_id
 * = wabaId), so account_id is the reliable join key. The WhatsApp
 * `metadata.phone_number_id` is NOT stored (the phone_number column holds the
 * display number), so we deliberately do not match on it.
 *
 * Returns the showroom_id, or null when no active integration matches. Callers
 * MUST treat null as "do not create a lead" (fail closed) so a message can
 * never be misrouted into the wrong tenant.
 */
export async function resolveShowroomFromProviderAccount(
  provider: IntegrationProvider,
  accountId: string | null | undefined,
): Promise<string | null> {
  if (!accountId) return null
  const sb = supaServer()
  const { data, error } = await sb
    .from('integrations')
    .select('showroom_id')
    .eq('provider', provider)
    .eq('account_id', accountId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return (data.showroom_id as string | null) ?? null
}

export type ProcessMessageArgs = {
  platform: 'whatsapp' | 'facebook' | 'instagram'
  messageText: string
  senderName?: string | null
  platformPhone?: string | null  // WhatsApp gives us the sender phone directly
  /**
   * The showroom that owns the receiving Meta business account. REQUIRED —
   * fail closed. Webhook routes resolve it from the inbound account id via
   * `resolveShowroomFromProviderAccount`; the /integrations/test endpoint
   * passes the caller's authenticated showroom. Without it we refuse to
   * create a lead, so a message can never be misrouted into another tenant.
   */
  showroomId: string
}

export type ProcessResult = {
  ok: true
  leadId?: string
  created?: boolean
  skipped?: 'no_phone' | 'duplicate' | 'empty_message'
  extracted: ExtractedLead
} | { ok: false; error: string }

// Core flow shared by all 3 platforms:
// 1. Run AI extraction on the message text
// 2. Use WhatsApp's platform phone if the AI didn't find one
// 3. Skip if still no phone (required trigger)
// 4. Look up an existing lead by phone → skip if already present
// 5. Find first active agent in the showroom to assign
// 6. Insert the lead + a system activity
export async function processIncomingMessage(args: ProcessMessageArgs): Promise<ProcessResult> {
  const { platform, messageText, senderName, platformPhone, showroomId } = args

  // Fail closed: never create a lead without an explicitly resolved showroom.
  // Webhook routes resolve it from the inbound Meta account id and skip the
  // entry when unknown; this guard is the last line of defence so no caller
  // can ever insert an unscoped (misroutable) lead.
  if (!showroomId) {
    return { ok: false, error: 'showroom_id required — refusing to create an unscoped lead' }
  }

  const text = (messageText ?? '').trim()
  if (!text) return { ok: true, skipped: 'empty_message', extracted: {
    phone: null, name: null, wilaya: null, model_wanted: null, budget_dzd: null,
  } }

  const extracted = await detectLeadFromMessage(text)

  const phoneSource = extracted.phone || platformPhone || null
  if (!phoneSource) {
    return { ok: true, skipped: 'no_phone', extracted }
  }
  const phone = normalizePhone(phoneSource)

  const sb = supaServer()

  // De-dupe by phone WITHIN the owning showroom, so tenant phone collisions
  // never cross-link leads.
  const existing = await sb
    .from('leads')
    .select('id')
    .eq('phone', phone)
    .eq('showroom_id', showroomId)
    .limit(1)
    .maybeSingle()

  if (existing.data?.id) {
    return { ok: true, leadId: existing.data.id, created: false, skipped: 'duplicate', extracted }
  }

  // Pick an assignee WITHIN the owning showroom: prefer the oldest active
  // agent, else the oldest active user. Deterministic ORDER BY so the choice
  // is stable. If the showroom has no active user the lead is still created
  // in the correct showroom with assigned_to = null (never misrouted).
  const agent = await sb
    .from('users')
    .select('id')
    .eq('is_active', true)
    .eq('role', 'agent')
    .eq('showroom_id', showroomId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let assignee = agent.data
  if (!assignee) {
    assignee = (await sb
      .from('users')
      .select('id')
      .eq('is_active', true)
      .eq('showroom_id', showroomId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()).data
  }

  const fullName = extracted.name?.trim() || senderName?.trim() || 'Prospect ' + platform

  const source: LeadSource = platform === 'whatsapp'
    ? 'whatsapp'
    : platform === 'facebook' ? 'facebook' : 'instagram'

  const insertPayload: Record<string, unknown> = {
    full_name:   fullName,
    phone,
    wilaya:      extracted.wilaya,
    source,
    status:      'new',
    notes:       text.length > 1000 ? text.slice(0, 1000) + '…' : text,
    assigned_to: assignee?.id ?? null,
    showroom_id: showroomId,
  }
  if (extracted.model_wanted) insertPayload.model_wanted = extracted.model_wanted
  if (extracted.budget_dzd != null) insertPayload.budget_dzd = extracted.budget_dzd

  // First attempt
  let basePayload = { ...insertPayload }
  let ins = await sb.from('leads').insert([basePayload]).select('id').single()

  // Fallback A: DB missing model_wanted / budget_dzd (migration 01 not applied)
  if (ins.error && /model_wanted|budget_dzd/i.test(ins.error.message)) {
    basePayload = { ...insertPayload }
    delete basePayload.model_wanted
    delete basePayload.budget_dzd
    ins = await sb.from('leads').insert([basePayload]).select('id').single()
  }

  // Fallback B: source CHECK constraint rejects new values (migration 01 not applied)
  if (ins.error && /source_check/i.test(ins.error.message)) {
    const mapped: Record<LeadSource, string> = {
      whatsapp:  'phone',
      telephone: 'phone',
      facebook:  'social',
      instagram: 'social',
      'walk-in': 'walk-in',
      phone:     'phone',
      website:   'website',
      referral:  'referral',
      social:    'social',
    }
    basePayload = { ...basePayload, source: mapped[source] }
    ins = await sb.from('leads').insert([basePayload]).select('id').single()
  }

  if (ins.error || !ins.data) {
    return { ok: false, error: ins.error?.message || 'insert failed' }
  }

  // Log a system activity so the lead timeline shows the origin message
  await sb.from('activities').insert([{
    showroom_id: showroomId,
    lead_id:     ins.data.id,
    user_id:     assignee?.id ?? null,
    type:        'note',
    title:       `Message entrant — ${platform}`,
    body:        text,
    done:        true,
  }])

  return { ok: true, leadId: ins.data.id, created: true, extracted }
}
