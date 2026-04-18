// ─────────────────────────────────────────────────────────────
// WhatsApp Business Webhook
//
// GET  — Meta verification handshake (hub.challenge)
// POST — Incoming messages. For each text message we extract
//        lead info via Claude and create a lead in Supabase.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import {
  processIncomingMessage,
  verifyChallenge,
  verifyMetaSignature,
} from '@/lib/webhook-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type WAContact = { wa_id?: string; profile?: { name?: string } }
type WAMessage = {
  from?: string
  id?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }
}
type WAValue = {
  messages?: WAMessage[]
  contacts?: WAContact[]
  messaging_product?: string
}
type WAChange = { field?: string; value?: WAValue }
type WAEntry  = { id?: string; changes?: WAChange[] }
type WAPayload = { object?: string; entry?: WAEntry[] }

export async function GET(req: Request) {
  const url = new URL(req.url)
  const challenge = verifyChallenge(url, process.env.WHATSAPP_VERIFY_TOKEN)
  if (challenge) return new Response(challenge, { status: 200 })
  return new Response('forbidden', { status: 403 })
}

export async function POST(req: Request) {
  const raw = await req.text()
  const sig = req.headers.get('x-hub-signature-256')

  if (!verifyMetaSignature(raw, sig)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let payload: WAPayload
  try {
    payload = JSON.parse(raw) as WAPayload
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const results: unknown[] = []

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {}
      const contacts = value.contacts ?? []
      const messages = value.messages ?? []

      for (const msg of messages) {
        // Only handle text-like messages; ignore status callbacks etc.
        const text =
          msg.text?.body ??
          msg.interactive?.button_reply?.title ??
          msg.interactive?.list_reply?.title ??
          ''
        if (!text) continue

        const contact = contacts.find((c) => c.wa_id === msg.from) || contacts[0]
        const senderName = contact?.profile?.name ?? null
        const platformPhone = msg.from ?? null

        const result = await processIncomingMessage({
          platform: 'whatsapp',
          messageText: text,
          senderName,
          platformPhone,
        })
        results.push(result)
      }
    }
  }

  // Meta expects a 200 quickly; details are for our own logs.
  return NextResponse.json({ ok: true, processed: results.length, results })
}
