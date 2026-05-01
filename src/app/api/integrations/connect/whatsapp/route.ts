import { NextResponse, type NextRequest } from 'next/server'
import { supaServer, isAllowedProvider } from '@/lib/integrations-utils'
import { requireShowroomMember, errorResponse } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────
// POST /api/integrations/connect/whatsapp
//
// Two supported modes:
//
// (A) REAL Meta Embedded Signup (WhatsApp):
//     Body: { showroom_id, access_token }
//     - Exchanges short → long-lived token
//     - Discovers the WABA and primary phone number
//     - Registers the phone + subscribes our app to webhooks
//     - Upserts an `integrations` row with the long-lived token
//
// (B) MOCK flow (kept for Messenger / Instagram and as a fallback
//     before Meta approval):
//     Body: { showroom_id, provider, account_name, phone_number,
//             account_id? }
//     - Upserts an active `integrations` row with no real tokens
// ─────────────────────────────────────────────────────────────

const GRAPH = 'https://graph.facebook.com/v21.0'

type GraphError = { error?: { message?: string; type?: string; code?: number } }

async function graphGet<T>(path: string, token: string): Promise<T> {
  const url = `${GRAPH}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`
  const res = await fetch(url, { method: 'GET' })
  const data = await res.json() as T & GraphError
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `Graph GET ${path} failed`
    throw new Error(msg)
  }
  return data
}

async function graphPost<T>(path: string, token: string, body: Record<string, unknown>): Promise<T> {
  const url = `${GRAPH}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  })
  const data = await res.json() as T & GraphError
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `Graph POST ${path} failed`
    throw new Error(msg)
  }
  return data
}

// ── Real flow ────────────────────────────────────────────────

type ExchangeResp = { access_token: string; token_type?: string; expires_in?: number }
type BusinessesResp = { data: { id: string; name?: string }[] }
type WabasResp = { data: { id: string; name?: string }[] }
type PhonesResp = {
  data: {
    id: string
    display_phone_number?: string
    verified_name?: string
  }[]
}

async function handleRealFlow(showroomId: string, shortToken: string) {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) {
    return NextResponse.json({ error: 'META_APP_ID / META_APP_SECRET not configured' }, { status: 500 })
  }

  // 1) Exchange short → long-lived user access token
  let longToken: string
  try {
    const qs = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    })
    const res = await fetch(`${GRAPH}/oauth/access_token?${qs.toString()}`)
    const data = await res.json() as ExchangeResp & GraphError
    if (!res.ok || data?.error || !data.access_token) {
      const msg = data?.error?.message || 'Échec de l’échange du token Meta'
      return NextResponse.json({ error: msg }, { status: 502 })
    }
    longToken = data.access_token
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Exchange token error',
    }, { status: 502 })
  }

  // 2) Discover the business and the WhatsApp Business Account
  let wabaId: string | null = null
  let wabaName: string | null = null
  try {
    const businesses = await graphGet<BusinessesResp>(`/me/businesses?fields=id,name`, longToken)
    const businessList = businesses.data ?? []
    if (businessList.length === 0) {
      return NextResponse.json({
        error: 'Aucun compte WhatsApp Business trouvé. Créez-en un sur business.facebook.com',
      }, { status: 404 })
    }

    // Try owned first, then client WABAs on each business until we find one
    for (const biz of businessList) {
      const owned = await graphGet<WabasResp>(
        `/${biz.id}/owned_whatsapp_business_accounts?fields=id,name`,
        longToken,
      ).catch(() => ({ data: [] as WabasResp['data'] }))
      if (owned.data?.length) {
        wabaId = owned.data[0].id
        wabaName = owned.data[0].name ?? biz.name ?? null
        break
      }
      const client = await graphGet<WabasResp>(
        `/${biz.id}/client_whatsapp_business_accounts?fields=id,name`,
        longToken,
      ).catch(() => ({ data: [] as WabasResp['data'] }))
      if (client.data?.length) {
        wabaId = client.data[0].id
        wabaName = client.data[0].name ?? biz.name ?? null
        break
      }
    }

    if (!wabaId) {
      return NextResponse.json({
        error: 'Aucun compte WhatsApp Business trouvé. Créez-en un sur business.facebook.com',
      }, { status: 404 })
    }
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Échec de la découverte du compte WhatsApp',
    }, { status: 502 })
  }

  // 3) Fetch phone numbers on the WABA
  let phoneNumberId: string | null = null
  let phoneNumberDisplay: string | null = null
  let phoneVerifiedName: string | null = null
  try {
    const phones = await graphGet<PhonesResp>(
      `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
      longToken,
    )
    const first = phones.data?.[0]
    if (!first) {
      return NextResponse.json({
        error: 'Aucun numéro de téléphone attaché à ce compte WhatsApp Business.',
      }, { status: 404 })
    }
    phoneNumberId = first.id
    phoneNumberDisplay = first.display_phone_number ?? null
    phoneVerifiedName = first.verified_name ?? null
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Échec de la récupération du numéro WhatsApp',
    }, { status: 502 })
  }

  // 4) Register the phone (required before we can send via Cloud API)
  //    The pin is set here; keep it private in the integration row too.
  const pin = Math.floor(100000 + Math.random() * 900000).toString()
  try {
    await graphPost(`/${phoneNumberId}/register`, longToken, {
      messaging_product: 'whatsapp',
      pin,
    })
  } catch (err) {
    // Non-fatal: phone might already be registered on another provider.
    // Log it but continue so we still save the integration.
    console.warn('[connect/whatsapp] register phone warning:', err instanceof Error ? err.message : err)
  }

  // 5) Subscribe our app to receive webhooks from this WABA
  try {
    await graphPost(`/${wabaId}/subscribed_apps`, longToken, {})
  } catch (err) {
    return NextResponse.json({
      error: 'Connexion partielle : échec de l’abonnement aux webhooks — ' +
        (err instanceof Error ? err.message : ''),
    }, { status: 502 })
  }

  // 6) Persist
  const sb = supaServer()
  const { data: integ, error: dbErr } = await sb
    .from('integrations')
    .upsert(
      [{
        showroom_id:  showroomId,
        provider:     'whatsapp',
        account_name: wabaName || phoneVerifiedName || 'WhatsApp Business',
        account_id:   wabaId,
        phone_number: phoneNumberDisplay || phoneNumberId,
        access_token: longToken,
        expires_at:   null, // long-lived user tokens are long-lived, not strictly perpetual
        is_active:    true,
        connected_at: new Date().toISOString(),
      }],
      { onConflict: 'showroom_id,provider' },
    )
    .select()
    .single()

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    integration: integ,
    account_name: wabaName,
    phone_number: phoneNumberDisplay,
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
  })
}

// ── Mock flow (Messenger / Instagram, or pre-approval fallback) ──

async function handleMockFlow(body: {
  showroom_id: string
  provider: 'whatsapp' | 'messenger' | 'instagram'
  account_name: string
  phone_number: string
  account_id: string | null
}) {
  const sb = supaServer()
  const { data, error } = await sb
    .from('integrations')
    .upsert(
      [{
        showroom_id:  body.showroom_id,
        provider:     body.provider,
        account_name: body.account_name,
        account_id:   body.account_id,
        phone_number: body.provider === 'whatsapp' ? body.phone_number : (body.phone_number || null),
        access_token: null,
        expires_at:   null,
        is_active:    true,
        connected_at: new Date().toISOString(),
      }],
      { onConflict: 'showroom_id,provider' },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, integration: data })
}

// ── Entry ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* ignore */ }

  const requested = typeof body.showroom_id === 'string' ? body.showroom_id : undefined

  let ctx
  try {
    ctx = await requireShowroomMember(req, requested)
  } catch (err) {
    return errorResponse(err)
  }

  // Tenant users get `ctx.showroomId` bound to their own showroom (the
  // request body's value is ignored / cross-checked); super admins must
  // pass an explicit showroom_id to choose a target.
  const showroomId = ctx.showroomId
  if (!showroomId) return NextResponse.json({ error: 'showroom_id required' }, { status: 400 })

  // Real flow: a Meta access token was provided by the client after FB.login.
  const accessToken = typeof body.access_token === 'string' && body.access_token.trim()
    ? body.access_token.trim()
    : null

  if (accessToken) {
    return handleRealFlow(showroomId, accessToken)
  }

  // Mock flow inputs
  const providerRaw  = typeof body.provider      === 'string' ? body.provider      : 'whatsapp'
  const phoneNumber  = typeof body.phone_number  === 'string' ? body.phone_number.trim()  : ''
  const accountName  = typeof body.account_name  === 'string' ? body.account_name.trim()  : ''
  const accountId    = typeof body.account_id    === 'string' ? body.account_id.trim()    : null

  if (!isAllowedProvider(providerRaw)) {
    return NextResponse.json({ error: 'invalid provider' }, { status: 400 })
  }
  if (!accountName) return NextResponse.json({ error: 'account_name required' }, { status: 400 })
  if (providerRaw === 'whatsapp' && !phoneNumber) {
    return NextResponse.json({ error: 'phone_number required for whatsapp' }, { status: 400 })
  }

  return handleMockFlow({
    showroom_id:  showroomId,
    provider:     providerRaw,
    account_name: accountName,
    phone_number: phoneNumber,
    account_id:   accountId,
  })
}

// Placeholder for the real OAuth redirect — kept as a GET so the
// frontend can eventually `window.location = /api/integrations/connect/whatsapp`.
export async function GET() {
  return NextResponse.json({
    ok: false,
    error: 'OAuth flow runs client-side via FB.login; POST this endpoint with access_token.',
  }, { status: 405 })
}
