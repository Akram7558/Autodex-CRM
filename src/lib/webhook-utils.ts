// ─────────────────────────────────────────────────────────────
// Shared helpers for Meta webhook routes (WhatsApp, Messenger,
// Instagram). Signature verification + lead upsert logic.
// ─────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { LeadSource } from './types'
import { detectLeadFromMessage, type ExtractedLead } from './ai-lead-detector'

export function supaServer(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

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

export type ProcessMessageArgs = {
  platform: 'whatsapp' | 'facebook' | 'instagram'
  messageText: string
  senderName?: string | null
  platformPhone?: string | null  // WhatsApp gives us the sender phone directly
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
  const { platform, messageText, senderName, platformPhone } = args
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

  // De-dupe by phone
  const existing = await sb
    .from('leads')
    .select('id')
    .eq('phone', phone)
    .limit(1)
    .maybeSingle()

  if (existing.data?.id) {
    return { ok: true, leadId: existing.data.id, created: false, skipped: 'duplicate', extracted }
  }

  // Pick first active agent (fall back to any active user) to own the lead
  const agent = await sb
    .from('users')
    .select('id, showroom_id, role, is_active')
    .eq('is_active', true)
    .eq('role', 'agent')
    .limit(1)
    .maybeSingle()

  const assignee = agent.data
    ? agent.data
    : (await sb
        .from('users')
        .select('id, showroom_id, role, is_active')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()).data

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
    showroom_id: assignee?.showroom_id ?? null,
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
    lead_id:   ins.data.id,
    user_id:   assignee?.id ?? null,
    type:      'note',
    title:     `Message entrant — ${platform}`,
    body:      text,
    done:      true,
  }])

  return { ok: true, leadId: ins.data.id, created: true, extracted }
}
