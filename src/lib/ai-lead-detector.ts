// ─────────────────────────────────────────────────────────────
// AI Lead Detector
//
// Takes a free-form message (darija / French / Arabic) from a
// WhatsApp, Messenger or Instagram conversation and extracts the
// structured lead fields the CRM cares about.
//
// Phone is the trigger: only when a phone number is found do we
// actually create a lead downstream. Everything else is optional.
// ─────────────────────────────────────────────────────────────

const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const CLAUDE_URL   = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export type ExtractedLead = {
  phone:         string | null
  name:          string | null
  wilaya:        string | null
  model_wanted:  string | null
  budget_dzd:    number | null
}

const EMPTY: ExtractedLead = {
  phone: null, name: null, wilaya: null, model_wanted: null, budget_dzd: null,
}

function buildPrompt(messageText: string): string {
  return `Extract lead information from this message. Return ONLY a JSON object with these fields:
- phone: phone number if found (string, null if not found)
- name: customer name if mentioned (string, null if not found)
- wilaya: Algerian wilaya if mentioned (string, null if not found)
- model_wanted: car model if mentioned (string, null if not found)
- budget_dzd: budget in DZD if mentioned (number, null if not found)

Message: ${messageText}

Rules:
- Phone is the TRIGGER - only create a lead if phone is found
- Accept phone formats: 05XX, 06XX, 07XX, +213XX
- Detect wilayas: Oran, Alger, Constantine, Annaba, Sétif, Blida, etc.
- Detect car models: Geely, Chery, Fiat, Renault, DFSK, Toyota, etc.
- Works in Algerian darija, French, and Arabic`
}

// Best-effort JSON extraction: Claude usually returns a bare object,
// but sometimes wraps it in prose or code fences. Pull out the first
// JSON object we can find and parse it.
function parseJsonFromText(text: string): Partial<ExtractedLead> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    try { return JSON.parse(fenced[1]) } catch { /* fall through */ }
  }
  const braceStart = text.indexOf('{')
  const braceEnd   = text.lastIndexOf('}')
  if (braceStart !== -1 && braceEnd > braceStart) {
    try { return JSON.parse(text.slice(braceStart, braceEnd + 1)) } catch { /* fall through */ }
  }
  try { return JSON.parse(text) } catch { return null }
}

function coerce(raw: Partial<ExtractedLead> | null): ExtractedLead {
  if (!raw) return { ...EMPTY }
  const out: ExtractedLead = { ...EMPTY }
  if (typeof raw.phone === 'string' && raw.phone.trim()) out.phone = raw.phone.trim()
  if (typeof raw.name  === 'string' && raw.name.trim())  out.name  = raw.name.trim()
  if (typeof raw.wilaya === 'string' && raw.wilaya.trim()) out.wilaya = raw.wilaya.trim()
  if (typeof raw.model_wanted === 'string' && raw.model_wanted.trim()) out.model_wanted = raw.model_wanted.trim()
  if (typeof raw.budget_dzd === 'number' && Number.isFinite(raw.budget_dzd)) {
    out.budget_dzd = raw.budget_dzd
  } else if (typeof raw.budget_dzd === 'string') {
    const n = parseFloat(String(raw.budget_dzd).replace(/[\s\u00a0.,]/g, (c) => c === '.' ? '.' : ''))
    if (!Number.isNaN(n)) out.budget_dzd = n
  }
  return out
}

// Fallback regex in case the Claude call fails. We still at least want
// to find a phone number so Algerian formats still trigger lead creation
// without burning credits.
export function detectPhoneRegex(text: string): string | null {
  // +213 5/6/7 XX XX XX XX  or  05/06/07 XX XX XX XX
  const cleaned = text.replace(/[^\d+]/g, ' ')
  const m =
    cleaned.match(/\+213\s*[5-7](?:\s*\d){8}/) ||
    cleaned.match(/0\s*[5-7](?:\s*\d){8}/)
  if (!m) return null
  return m[0].replace(/\s+/g, '')
}

export async function detectLeadFromMessage(messageText: string): Promise<ExtractedLead> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'placeholder') {
    // Graceful degradation when the key isn't configured yet.
    return { ...EMPTY, phone: detectPhoneRegex(messageText) }
  }

  try {
    const res = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 256,
        messages: [{ role: 'user', content: buildPrompt(messageText) }],
      }),
    })

    if (!res.ok) {
      console.error('[ai-lead-detector] claude error', res.status, await res.text().catch(() => ''))
      return { ...EMPTY, phone: detectPhoneRegex(messageText) }
    }

    const data = await res.json() as { content?: { type: string; text: string }[] }
    const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim()
    const parsed = parseJsonFromText(text)
    const coerced = coerce(parsed)
    // Never lose a phone we could have caught locally
    if (!coerced.phone) coerced.phone = detectPhoneRegex(messageText)
    return coerced
  } catch (err) {
    console.error('[ai-lead-detector] call failed', err)
    return { ...EMPTY, phone: detectPhoneRegex(messageText) }
  }
}
