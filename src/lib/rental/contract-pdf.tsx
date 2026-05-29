// ─────────────────────────────────────────────────────────────────────
// contract-pdf.tsx — declarative @react-pdf/renderer document for the
// downloadable FR rental contract. Server-only (runtime='nodejs' route).
//
// Default font is Helvetica, which covers French accents — no custom font
// embed needed. Every optional field is rendered defensively: a missing
// value is either omitted (whole line) or shown as an em dash, never as
// "undefined"/"null".
// ─────────────────────────────────────────────────────────────────────

import {
  Document, Page, View, Text, StyleSheet,
} from '@react-pdf/renderer'

const DZD = new Intl.NumberFormat('fr-FR')

/** null/undefined/NaN → '—', else "12 345 DZD". */
function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${DZD.format(n)} DZD`
}

/** yyyy-mm-dd → "12 mai 2026" (fr-FR, with year). Falls back to raw on parse fail. */
function longDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date((d.length <= 10 ? d + 'T00:00:00' : d))
  if (Number.isNaN(dt.getTime())) return d
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(dt)
}

/** "HH:MM" from a "HH:MM[:SS]" time, or '' if absent. */
function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

export type ContractPdfData = {
  contractNumber: string | null
  showroom: {
    name:    string
    city:    string | null
    address: string | null
    phone:   string | null
  }
  customer: {
    full_name:      string
    phone:          string | null
    cin_number:     string | null
    permis_number:  string | null
    address:        string | null
    wilaya:         string | null
    date_naissance: string | null
  } | null
  vehicle: {
    marque:          string
    modele:          string
    annee:           number | null
    immatriculation: string
    daily_rate:      number | null
  } | null
  period: {
    start_date:    string
    start_time:    string | null
    end_date:      string
    end_time:      string | null
    duration_days: number
  }
  amounts: {
    total:   number | null
    deposit: number | null
  }
}

const C = {
  ink:    '#111827',
  body:   '#374151',
  muted:  '#6b7280',
  line:   '#d1d5db',
  soft:   '#f3f4f6',
  accent: '#0f766e',
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36, paddingBottom: 40, paddingHorizontal: 40,
    fontSize: 10, color: C.body, fontFamily: 'Helvetica', lineHeight: 1.4,
  },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  brandName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.ink },
  brandLine: { fontSize: 9, color: C.muted, marginTop: 1 },
  titleBox: { alignItems: 'flex-end' },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.accent, letterSpacing: 0.5 },
  meta: { fontSize: 9, color: C.muted, marginTop: 2 },
  metaStrong: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.ink, marginTop: 2 },

  rule: { borderBottomWidth: 1.5, borderBottomColor: C.accent, marginTop: 8, marginBottom: 14 },

  // Two-column block row
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  col: { flex: 1 },

  block: { borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 10 },
  blockTitle: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.accent,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
  },

  // Definition line: label + value
  line: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 92, color: C.muted, fontSize: 9 },
  value: { flex: 1, color: C.ink, fontSize: 10 },
  valueStrong: { flex: 1, color: C.ink, fontSize: 11, fontFamily: 'Helvetica-Bold' },

  // Amounts highlight strip
  amounts: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  amountCard: { flex: 1, backgroundColor: C.soft, borderRadius: 4, padding: 10 },
  amountLabel: { fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  amountValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.ink, marginTop: 3 },

  // Conditions
  conditions: { marginBottom: 18 },
  condTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.accent, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  condText: { fontSize: 8.5, color: C.muted, lineHeight: 1.5 },

  // Signatures
  sigRow: { flexDirection: 'row', gap: 16, marginTop: 6 },
  sigCol: { flex: 1 },
  sigCaption: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.ink, marginBottom: 4 },
  sigBox: { borderWidth: 1, borderColor: C.line, borderRadius: 4, height: 70 },
  empreinteCaption: { fontSize: 8, color: C.muted, marginTop: 8, marginBottom: 4 },
  empreinteBox: { borderWidth: 1, borderColor: C.line, borderStyle: 'dashed', borderRadius: 4, height: 80 },

  footer: {
    position: 'absolute', bottom: 22, left: 40, right: 40,
    textAlign: 'center', fontSize: 7.5, color: C.muted,
  },
})

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

export function RentalContractDocument({ data }: { data: ContractPdfData }) {
  const { showroom, customer, vehicle, period, amounts } = data
  const today = longDate(new Date().toISOString().slice(0, 10))

  // Showroom contact line: join the present pieces only.
  const showroomLoc = [showroom.address, showroom.city].filter(Boolean).join(', ')
  const startStr = `${longDate(period.start_date)}${hhmm(period.start_time) ? ` à ${hhmm(period.start_time)}` : ''}`
  const endStr   = `${longDate(period.end_date)}${hhmm(period.end_time) ? ` à ${hhmm(period.end_time)}` : ''}`

  const vehLabel = vehicle
    ? `${vehicle.marque} ${vehicle.modele}${vehicle.annee ? ` (${vehicle.annee})` : ''}`
    : '—'

  return (
    <Document title={`Contrat ${data.contractNumber ?? ''}`.trim()} author={showroom.name}>
      <Page size="A4" style={styles.page}>
        {/* ── Header ───────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandName}>{showroom.name}</Text>
            {showroomLoc ? <Text style={styles.brandLine}>{showroomLoc}</Text> : null}
            {showroom.phone ? <Text style={styles.brandLine}>Tél. {showroom.phone}</Text> : null}
          </View>
          <View style={styles.titleBox}>
            <Text style={styles.title}>CONTRAT DE LOCATION</Text>
            <Text style={styles.metaStrong}>N° {data.contractNumber ?? '—'}</Text>
            <Text style={styles.meta}>Établi le {today}</Text>
          </View>
        </View>
        <View style={styles.rule} />

        {/* ── Loueur / Locataire ───────────────────────────── */}
        <View style={styles.row}>
          <View style={styles.col}>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Le loueur</Text>
              <Line label="Société" value={showroom.name} />
              {showroomLoc ? <Line label="Adresse" value={showroomLoc} /> : null}
              {showroom.phone ? <Line label="Téléphone" value={showroom.phone} /> : null}
            </View>
          </View>
          <View style={styles.col}>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Le locataire</Text>
              <Line label="Nom" value={customer?.full_name ?? '—'} />
              {customer?.phone ? <Line label="Téléphone" value={customer.phone} /> : null}
              {customer?.cin_number ? <Line label="N° CIN" value={customer.cin_number} /> : null}
              {customer?.permis_number ? <Line label="N° permis" value={customer.permis_number} /> : null}
              {customer?.date_naissance ? <Line label="Né(e) le" value={longDate(customer.date_naissance)} /> : null}
              {customer?.address || customer?.wilaya
                ? <Line label="Adresse" value={[customer?.address, customer?.wilaya].filter(Boolean).join(', ')} />
                : null}
            </View>
          </View>
        </View>

        {/* ── Véhicule / Période ───────────────────────────── */}
        <View style={styles.row}>
          <View style={styles.col}>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Véhicule</Text>
              <Line label="Modèle" value={vehLabel} />
              <Line label="Immatricul." value={vehicle?.immatriculation ?? '—'} />
              <Line label="Tarif / jour" value={money(vehicle?.daily_rate)} />
            </View>
          </View>
          <View style={styles.col}>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Période de location</Text>
              <Line label="Du" value={startStr} />
              <Line label="Au" value={endStr} />
              <Line label="Durée" value={`${period.duration_days} jour${period.duration_days > 1 ? 's' : ''}`} />
            </View>
          </View>
        </View>

        {/* ── Montants ─────────────────────────────────────── */}
        <View style={styles.amounts}>
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Total location</Text>
            <Text style={styles.amountValue}>{money(amounts.total)}</Text>
          </View>
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Caution</Text>
            <Text style={styles.amountValue}>{money(amounts.deposit)}</Text>
          </View>
        </View>

        {/* ── Conditions ───────────────────────────────────── */}
        <View style={styles.conditions}>
          <Text style={styles.condTitle}>Conditions</Text>
          <Text style={styles.condText}>
            Le locataire reconnaît avoir reçu le véhicule en bon état et s&apos;engage à le restituer dans
            le même état, aux dates et heures convenues ci-dessus. La caution est restituée après
            vérification du véhicule au retour, déduction faite des éventuels frais à la charge du locataire.
          </Text>
        </View>

        {/* ── Signatures + empreinte ───────────────────────── */}
        <View style={styles.sigRow}>
          <View style={styles.sigCol}>
            <Text style={styles.sigCaption}>Signature du locataire</Text>
            <View style={styles.sigBox} />
            <Text style={styles.empreinteCaption}>Empreinte du locataire</Text>
            <View style={styles.empreinteBox} />
          </View>
          <View style={styles.sigCol}>
            <Text style={styles.sigCaption}>Signature du loueur</Text>
            <View style={styles.sigBox} />
          </View>
        </View>

        <Text style={styles.footer} fixed>
          {showroom.name}{showroomLoc ? ` — ${showroomLoc}` : ''}{showroom.phone ? ` — Tél. ${showroom.phone}` : ''}
        </Text>
      </Page>
    </Document>
  )
}
