// ─────────────────────────────────────────────────────────────
// Facebook Messenger Webhook
//
// GET  — Meta verification handshake (hub.challenge)
// POST — Incoming page messages. Messenger does not give us the
//        user's phone directly, so lead creation depends on the
//        AI extracting one from the message text.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import {
  processIncomingMessage,
  verifyChallenge,
  verifyMetaSignature,
} from '@/lib/webhook-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type FBMessage = {
  sender?: { id?: string; name?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    quick_reply?: { payload?: string }
  }
  postback?: { title?: string; payload?: string }
}
type FBEntry = {
  id?: string
  time?: number
  messaging?: FBMessage[]
}
type FBPayload = { object?: string; entry?: FBEntry[] }

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

  let payload: FBPayload
  try {
    payload = JSON.parse(raw) as FBPayload
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const results: unknown[] = []

  for (const entry of payload.entry ?? []) {
    for (const m of entry.messaging ?? []) {
      // Skip echoes of our own outbound messages
      if (m.message?.is_echo) continue

      const text =
        m.message?.text ??
        m.postback?.title ??
        m.postback?.payload ??
        m.message?.quick_reply?.payload ??
        ''
      if (!text) continue

      const senderName = m.sender?.name ?? null

      const result = await processIncomingMessage({
        platform: 'facebook',
        messageText: text,
        senderName,
        platformPhone: null,
      })
      results.push(result)
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
