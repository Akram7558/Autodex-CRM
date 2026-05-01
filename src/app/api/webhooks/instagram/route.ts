// ─────────────────────────────────────────────────────────────
// Instagram DM Webhook
//
// GET  — Meta verification handshake (hub.challenge)
// POST — Incoming Instagram direct messages. Same shape as the
//        Messenger webhook; Instagram does not expose the user's
//        phone, so lead creation relies on the AI extracting one
//        from the message body.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import {
  processIncomingMessage,
  verifyChallenge,
  verifyMetaSignature,
} from '@/lib/webhook-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type IGMessage = {
  sender?: { id?: string; username?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: {
    mid?: string
    text?: string
    is_echo?: boolean
    is_deleted?: boolean
    quick_reply?: { payload?: string }
  }
}
type IGEntry = {
  id?: string
  time?: number
  messaging?: IGMessage[]
}
type IGPayload = { object?: string; entry?: IGEntry[] }

export async function GET(req: Request) {
  const url = new URL(req.url)
  const challenge = verifyChallenge(url, process.env.WHATSAPP_VERIFY_TOKEN)
  if (challenge) return new Response(challenge, { status: 200 })
  return new Response('forbidden', { status: 403 })
}

export async function POST(req: Request) {
  const raw = await req.text()
  const sig = req.headers.get('x-hub-signature-256')

  // Dev bypass: lets us POST test payloads without a valid Meta signature.
  // Only honored when TEST_WEBHOOK_TOKEN is configured server-side AND
  // the request supplies the matching value in the x-test-mode header.
  // Production deploys leave TEST_WEBHOOK_TOKEN unset, which forces real
  // Meta signature verification on every request.
  const expectedToken = process.env.TEST_WEBHOOK_TOKEN
  const testMode = !!expectedToken && req.headers.get('x-test-mode') === expectedToken

  if (!testMode && !verifyMetaSignature(raw, sig)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let payload: IGPayload
  try {
    payload = JSON.parse(raw) as IGPayload
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const results: unknown[] = []

  for (const entry of payload.entry ?? []) {
    for (const m of entry.messaging ?? []) {
      if (m.message?.is_echo || m.message?.is_deleted) continue

      const text =
        m.message?.text ??
        m.message?.quick_reply?.payload ??
        ''
      if (!text) continue

      const senderName = m.sender?.username ?? null

      const result = await processIncomingMessage({
        platform: 'instagram',
        messageText: text,
        senderName,
        platformPhone: null,
      })
      results.push(result)
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
