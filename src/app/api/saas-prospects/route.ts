// ─────────────────────────────────────────────────────────────────────
// /api/saas-prospects
// ─────────────────────────────────────────────────────────────────────
//   GET   — paginated list of SaaS prospects (RLS filters per role)
//   POST  — create a SaaS prospect
//
// All operations gated by requireInternalUser. RLS does the heavy
// lifting — prospecteur_saas only sees rows assigned to them.
// ─────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from 'next/server'
import { requireInternalUser, errorResponse } from '@/lib/api-auth'
import { normalizePhone, PhoneNormalizeError } from '@/lib/phone'
import {
  SAAS_SUIVI_VALUES, SAAS_SOURCE_VALUES, SAAS_SIZE_VALUES,
  type SaasSuivi, type SaasSource, type SaasShowroomSize,
} from '@/lib/types'

export const runtime = 'nodejs'

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── GET ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireInternalUser(req)

    const url    = new URL(req.url)
    const suivi  = url.searchParams.get('suivi')
    const source = url.searchParams.get('source')
    const search = url.searchParams.get('search')?.trim() ?? ''
    const page   = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1', 10) || 1)
    const limit  = Math.min(150, Math.max(1, parseInt(url.searchParams.get('limit') ?? '15', 10) || 15))
    const from   = (page - 1) * limit
    const to     = from + limit - 1

    let q = ctx.authSb
      .from('super_admin_prospects')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (suivi  && SAAS_SUIVI_VALUES.includes(suivi as SaasSuivi))      q = q.eq('suivi',  suivi)
    if (source && SAAS_SOURCE_VALUES.includes(source as SaasSource))   q = q.eq('source', source)
    if (search) {
      // Match on name / phone / showroom_name. PostgREST OR uses commas.
      const term = search.replace(/[,()%]/g, '')
      q = q.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,showroom_name.ilike.%${term}%`)
    }

    const { data, error, count } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      prospects: data ?? [],
      total:     count ?? 0,
      page,
      limit,
    })
  } catch (err) {
    return errorResponse(err)
  }
}

// ── POST ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireInternalUser(req)
    const body = await req.json().catch(() => ({}))

    const full_name     = String(body.full_name     ?? '').trim()
    const phoneRaw      = String(body.phone         ?? '').trim()
    const showroom_name = String(body.showroom_name ?? '').trim()
    const city          = body.city          ? String(body.city).trim()  : null
    const email         = body.email         ? String(body.email).trim().toLowerCase() : null
    const notes         = body.notes         ? String(body.notes)        : null
    const showroom_size = body.showroom_size ? String(body.showroom_size) as SaasShowroomSize : null
    const source        = body.source        ? String(body.source)       as SaasSource       : 'manuel'
    const suivi         = body.suivi         ? String(body.suivi)        as SaasSuivi        : 'nouveau'
    const assigned_to   = body.assigned_to   ? String(body.assigned_to)  : null

    if (!full_name)     return NextResponse.json({ error: 'Nom complet requis.' },        { status: 400 })
    if (!showroom_name) return NextResponse.json({ error: 'Nom du showroom requis.' },    { status: 400 })

    let phone: string
    try { phone = normalizePhone(phoneRaw) }
    catch (e) {
      const msg = e instanceof PhoneNormalizeError ? e.message : 'Téléphone invalide.'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    if (email && !EMAIL_RX.test(email)) {
      return NextResponse.json({ error: 'Email invalide.' }, { status: 400 })
    }
    if (showroom_size && !SAAS_SIZE_VALUES.includes(showroom_size)) {
      return NextResponse.json({ error: 'Taille de showroom invalide.' }, { status: 400 })
    }
    if (!SAAS_SOURCE_VALUES.includes(source)) {
      return NextResponse.json({ error: 'Source invalide.' }, { status: 400 })
    }
    if (!SAAS_SUIVI_VALUES.includes(suivi)) {
      return NextResponse.json({ error: 'Suivi invalide.' }, { status: 400 })
    }

    // Authorization on assigned_to: prospecteur_saas can only assign to themselves.
    let finalAssignedTo: string | null = assigned_to
    if (ctx.role === 'prospecteur_saas') {
      if (assigned_to && assigned_to !== ctx.user.id) {
        return NextResponse.json({ error: 'Vous ne pouvez vous assigner que vous-même.' }, { status: 403 })
      }
      finalAssignedTo = ctx.user.id
    }

    const payload = {
      full_name,
      phone,
      city,
      showroom_name,
      showroom_size,
      email,
      notes,
      suivi,
      source,
      assigned_to: finalAssignedTo,
      // created_by is stamped server-side by the BEFORE INSERT trigger.
    }

    const { data, error } = await ctx.authSb
      .from('super_admin_prospects')
      .insert([payload])
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ prospect: data })
  } catch (err) {
    return errorResponse(err)
  }
}
