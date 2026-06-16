// ─────────────────────────────────────────────────────────────────────
// Resend email helpers — shared by all admin/trial flows.
// ─────────────────────────────────────────────────────────────────────
// Wrapped around the Resend HTTP API (no SDK dependency). All sends are
// best-effort: failures are returned in the result object rather than
// thrown, so callers can decide whether the email failure is fatal.
//
// Required env vars (server-side only):
//   RESEND_API_KEY  — secret API key, set in Vercel
//   RESEND_FROM     — optional, defaults to "AutoDex <noreply@autodex.store>"
//
// All AutoDex internal notifications go to a single address — pulled
// from RESEND_INTERNAL_NOTIFY_EMAIL when set, otherwise the hard-coded
// fallback is the admin's gmail (matches the spec).
// ─────────────────────────────────────────────────────────────────────

const RESEND_FROM_DEFAULT = 'AutoDex <noreply@autodex.store>'
const INTERNAL_NOTIFY_FALLBACK = 'akrambrk12@gmail.com'

export type SendEmailArgs = {
  to:      string | string[]
  subject: string
  text?:   string
  html?:   string
  /** Override the From header. Defaults to RESEND_FROM env var. */
  from?:   string
}

export type SendEmailResult =
  | { ok: true }
  | { ok: false; error: string }

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY missing' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    args.from ?? process.env.RESEND_FROM ?? RESEND_FROM_DEFAULT,
        to:      Array.isArray(args.to) ? args.to : [args.to],
        subject: args.subject,
        text:    args.text,
        html:    args.html,
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { ok: false, error: `Resend ${res.status}: ${errText.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

/** Where AutoDex internal notifications (new trial, conversion, etc.) go. */
export function internalNotifyAddress(): string {
  return process.env.RESEND_INTERNAL_NOTIFY_EMAIL ?? INTERNAL_NOTIFY_FALLBACK
}

// ─────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────

const SITE_URL  = 'https://www.autodex.store'
const ESC_QUOTE = (s: string) => s.replace(/[<>]/g, '')
const fmtDzd    = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)

function shellHtml(inner: string): string {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;max-width:560px;width:100%;">
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <p style="margin:0;font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#18181b;">AutoDex</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px 32px;font-size:14px;line-height:1.6;color:#27272a;">
                ${inner}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:11px;color:#71717a;text-align:center;">
                © 2026 AutoDex · <a href="${SITE_URL}" style="color:#71717a;text-decoration:none;">www.autodex.store</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function ctaButton(label: string, href: string): string {
  return `<p style="margin:24px 0;text-align:center;">
    <a href="${href}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;">${label}</a>
  </p>`
}

// ── Welcome / start of trial (to owner) ─────────────────────────────
export function welcomeTrialEmail(args: {
  ownerName:      string
  showroomName:   string
  ownerEmail:     string
  ownerPassword:  string
  trialEndsAtFr:  string  // already formatted dd/MM/yyyy
}): { subject: string; text: string; html: string } {
  const owner    = ESC_QUOTE(args.ownerName)
  const showroom = ESC_QUOTE(args.showroomName)
  const subject = 'Bienvenue sur AutoDex — Votre essai gratuit de 20 jours'

  const text =
`Bonjour ${args.ownerName},

Votre showroom ${args.showroomName} est maintenant configuré sur AutoDex.

Vous bénéficiez d'un essai gratuit de 20 jours jusqu'au ${args.trialEndsAtFr}.

Vos identifiants de connexion :
Email : ${args.ownerEmail}
Mot de passe : ${args.ownerPassword}

Connectez-vous : ${SITE_URL}

Pour toute question, contactez-nous sur WhatsApp.

L'équipe AutoDex`

  const html = shellHtml(`
    <p style="margin:0 0 12px 0;">Bonjour <strong>${owner}</strong>,</p>
    <p style="margin:0 0 12px 0;">Votre showroom <strong>${showroom}</strong> est maintenant configuré sur AutoDex.</p>
    <p style="margin:0 0 12px 0;">Vous bénéficiez d'un <strong>essai gratuit de 20 jours</strong> jusqu'au <strong>${args.trialEndsAtFr}</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;width:100%;">
      <tr><td style="padding:14px 16px;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#18181b;">
        Email : <strong>${ESC_QUOTE(args.ownerEmail)}</strong><br/>
        Mot de passe : <strong>${ESC_QUOTE(args.ownerPassword)}</strong>
      </td></tr>
    </table>
    ${ctaButton('Accéder à mon dashboard', SITE_URL)}
    <p style="margin:0 0 0 0;color:#52525b;">Pour toute question, contactez-nous sur WhatsApp.</p>
  `)

  return { subject, text, html }
}

// ── J-3 reminder (to owner) ─────────────────────────────────────────
export function trialJ3Email(args: {
  showroomName: string
  endsAtFr:     string
}): { subject: string; text: string; html: string } {
  const subject = '⚠️ Votre essai AutoDex expire dans 3 jours'
  const text =
`Bonjour,

Votre essai gratuit AutoDex pour ${args.showroomName} expire le ${args.endsAtFr}.

Contactez-nous pour continuer à utiliser AutoDex après cette date.

L'équipe AutoDex`
  const html = shellHtml(`
    <p style="margin:0 0 12px 0;">Bonjour,</p>
    <p style="margin:0 0 12px 0;">Votre essai gratuit AutoDex pour <strong>${ESC_QUOTE(args.showroomName)}</strong> expire le <strong>${args.endsAtFr}</strong>.</p>
    <p style="margin:0 0 12px 0;">Contactez-nous pour continuer à utiliser AutoDex après cette date.</p>
    ${ctaButton('Accéder à mon dashboard', SITE_URL)}
  `)
  return { subject, text, html }
}

// ── J-1 reminder (to owner) ─────────────────────────────────────────
export function trialJ1Email(args: {
  showroomName: string
  endsAtFr:     string
}): { subject: string; text: string; html: string } {
  const subject = 'Votre essai AutoDex expire demain'
  const text =
`Bonjour,

Votre essai gratuit AutoDex pour ${args.showroomName} expire demain (${args.endsAtFr}).

Contactez-nous pour continuer à utiliser AutoDex.

L'équipe AutoDex`
  const html = shellHtml(`
    <p style="margin:0 0 12px 0;">Bonjour,</p>
    <p style="margin:0 0 12px 0;">Votre essai gratuit AutoDex pour <strong>${ESC_QUOTE(args.showroomName)}</strong> expire <strong>demain</strong> (${args.endsAtFr}).</p>
    <p style="margin:0 0 12px 0;">Contactez-nous dès aujourd'hui pour continuer à utiliser AutoDex.</p>
    ${ctaButton('Accéder à mon dashboard', SITE_URL)}
  `)
  return { subject, text, html }
}

// ── Trial converted (to owner) ──────────────────────────────────────
export function trialConvertedEmail(args: {
  showroomName: string
  expiresAtFr:  string
}): { subject: string; text: string; html: string } {
  const subject = 'Félicitations — Votre compte AutoDex est actif'
  const text =
`Félicitations !

Votre compte AutoDex pour ${args.showroomName} est maintenant actif jusqu'au ${args.expiresAtFr}.

L'équipe AutoDex`
  const html = shellHtml(`
    <p style="margin:0 0 12px 0;">🎉 Félicitations !</p>
    <p style="margin:0 0 12px 0;">Votre compte AutoDex pour <strong>${ESC_QUOTE(args.showroomName)}</strong> est maintenant actif jusqu'au <strong>${args.expiresAtFr}</strong>.</p>
    ${ctaButton('Accéder à mon dashboard', SITE_URL)}
  `)
  return { subject, text, html }
}

// ── Welcome email for paid-from-day-1 customers ─────────────────────
// Same structure as welcomeTrialEmail but the wording reflects an
// active subscription (no "essai gratuit" framing).
export function welcomePaidEmail(args: {
  ownerName:    string
  showroomName: string
  ownerEmail:   string
  ownerPassword:string
  planName:     string
  expiresAtFr:  string  // dd/MM/yyyy
}): { subject: string; text: string; html: string } {
  const owner    = ESC_QUOTE(args.ownerName)
  const showroom = ESC_QUOTE(args.showroomName)
  const subject = 'Bienvenue sur AutoDex !'

  const text =
`Bonjour ${args.ownerName},

Votre showroom ${args.showroomName} est maintenant configuré sur AutoDex avec un compte actif.

Plan : ${args.planName}
Compte actif jusqu'au ${args.expiresAtFr}.

Vos identifiants de connexion :
Email : ${args.ownerEmail}
Mot de passe : ${args.ownerPassword}

Connectez-vous : ${SITE_URL}

Pour toute question, contactez-nous sur WhatsApp.

L'équipe AutoDex`

  const html = shellHtml(`
    <p style="margin:0 0 12px 0;">Bonjour <strong>${owner}</strong>,</p>
    <p style="margin:0 0 12px 0;">Votre showroom <strong>${showroom}</strong> est maintenant configuré sur AutoDex avec un <strong>compte actif</strong>.</p>
    <p style="margin:0 0 12px 0;">Plan : <strong>${ESC_QUOTE(args.planName)}</strong> · Compte actif jusqu'au <strong>${args.expiresAtFr}</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;width:100%;">
      <tr><td style="padding:14px 16px;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#18181b;">
        Email : <strong>${ESC_QUOTE(args.ownerEmail)}</strong><br/>
        Mot de passe : <strong>${ESC_QUOTE(args.ownerPassword)}</strong>
      </td></tr>
    </table>
    ${ctaButton('Accéder à mon dashboard', SITE_URL)}
    <p style="margin:0 0 0 0;color:#52525b;">Pour toute question, contactez-nous sur WhatsApp.</p>
  `)

  return { subject, text, html }
}

// ── Weekly digest (to owner) ────────────────────────────────────────
// Module-aware: the ventes section shows only when module_vente is on, the
// location section only when module_location is on. The caller skips sending
// entirely when there is no activity, so this template assumes ≥1 metric.
export function weeklyDigestEmail(args: {
  showroomName: string
  periodLabel:  string   // e.g. "Semaine du 9 juin au 16 juin"
  dashboardUrl: string
  metrics: {
    newLeads:  number
    vente?:    { count: number; ca: number } | null         // module_vente
    location?: { newRentals: number; collected: number } | null // module_location
    alerts?:   { overdue: number; bigPayments: number; silent: number } | null
  }
}): { subject: string; text: string; html: string } {
  const showroom = ESC_QUOTE(args.showroomName)
  const period   = ESC_QUOTE(args.periodLabel)
  const m = args.metrics
  const a = m.alerts
  const hasAlerts = !!a && (a.overdue + a.bigPayments + a.silent) > 0
  const subject = `Récap de la semaine — ${args.showroomName}`

  const row = (label: string, value: string) =>
    `<tr><td style="padding:10px 16px;border-top:1px solid #f4f4f5;color:#52525b;">${label}</td>` +
    `<td style="padding:10px 16px;border-top:1px solid #f4f4f5;text-align:right;font-weight:700;color:#18181b;">${value}</td></tr>`

  const rows: string[] = [row('Nouveaux prospects', String(m.newLeads))]
  if (m.vente) {
    rows.push(row('Ventes conclues', String(m.vente.count)))
    rows.push(row("Chiffre d'affaires", `${fmtDzd(m.vente.ca)} DZD`))
  }
  if (m.location) {
    rows.push(row('Nouveaux contrats', String(m.location.newRentals)))
    rows.push(row('Encaissé (location)', `${fmtDzd(m.location.collected)} DZD`))
  }

  const alertHtml = hasAlerts && a
    ? `<p style="margin:16px 0 0 0;padding:12px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;color:#9a3412;font-size:13px;">` +
      `<strong>À surveiller :</strong> ${a.overdue} retard(s) · ${a.bigPayments} gros paiement(s) · ${a.silent} client(s) sans réponse.</p>`
    : ''

  const text =
`Récap de la semaine — ${args.showroomName}
${args.periodLabel}

Nouveaux prospects : ${m.newLeads}
${m.vente ? `Ventes conclues : ${m.vente.count} · Chiffre d'affaires : ${fmtDzd(m.vente.ca)} DZD\n` : ''}${m.location ? `Nouveaux contrats : ${m.location.newRentals} · Encaissé : ${fmtDzd(m.location.collected)} DZD\n` : ''}${hasAlerts && a ? `À surveiller : ${a.overdue} retard(s), ${a.bigPayments} gros paiement(s), ${a.silent} client(s) sans réponse\n` : ''}
Ouvrir mon tableau de bord : ${args.dashboardUrl}

L'équipe AutoDex`

  const html = shellHtml(`
    <p style="margin:0 0 4px 0;">Bonjour,</p>
    <p style="margin:0 0 16px 0;">Voici le récap de <strong>${showroom}</strong> — <strong>${period}</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden;font-size:14px;">
      ${rows.join('')}
    </table>
    ${alertHtml}
    ${ctaButton('Ouvrir mon tableau de bord', args.dashboardUrl)}
    <p style="margin:0;color:#52525b;">Bonne semaine,<br/>L'équipe AutoDex</p>
  `)

  return { subject, text, html }
}

// ── Internal notifications (plain text only) ────────────────────────
export function internalDirectConvertEmail(args: {
  showroomName:    string
  planName:        string
  contractAmount:  string
  expiresAtFr:     string
}): { subject: string; text: string } {
  return {
    subject: `[AutoDex] Nouveau client converti — ${args.showroomName}`,
    text: `Nouveau client converti : ${args.showroomName} — Plan: ${args.planName} — ${args.contractAmount} DZD — expire le ${args.expiresAtFr}`,
  }
}

export function internalTrialStartedEmail(args: {
  showroomName: string
  endsAtFr:     string
}): { subject: string; text: string } {
  return {
    subject: `[AutoDex] Nouvel essai — ${args.showroomName}`,
    text: `Nouvel essai gratuit démarré : ${args.showroomName} — expire le ${args.endsAtFr}`,
  }
}

export function internalConvertedEmail(args: {
  showroomName:    string
  contractAmount:  string  // already formatted DZD
  expiresAtFr:     string
}): { subject: string; text: string } {
  return {
    subject: `[AutoDex] Conversion — ${args.showroomName}`,
    text: `Showroom converti : ${args.showroomName} — ${args.contractAmount} DZD — expire le ${args.expiresAtFr}`,
  }
}

// ── Date utilities ──────────────────────────────────────────────────
export function formatDateFr(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  return `${dd}/${mm}/${yy}`
}
