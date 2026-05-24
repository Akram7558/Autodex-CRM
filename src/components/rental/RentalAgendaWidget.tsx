// ─────────────────────────────────────────────────────────────────────
// RentalAgendaWidget — "À venir" card for the Location hub.
// ─────────────────────────────────────────────────────────────────────
// Presentational (no client hooks): renders the live agenda groups
// (pickups / returns / overdue) computed server-side. Each line links to
// the contract detail. Groups render only when non-empty.
// ─────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { KeyRound, CornerDownLeft, AlertTriangle, CalendarClock } from 'lucide-react'
import type { AgendaItem, RentalAgenda } from '@/lib/rental/agenda'
import { relativeDayLabel } from '@/lib/rental/agenda'

export default function RentalAgendaWidget({
  agenda, today, tomorrow,
}: {
  agenda: RentalAgenda
  today: string
  tomorrow: string
}) {
  const empty = agenda.pickups.length === 0 && agenda.returns.length === 0 && agenda.overdue.length === 0

  return (
    <div className="glass-card p-6 rounded-2xl" style={{ borderColor: 'var(--border)' }}>
      <h2 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Agenda — à venir
      </h2>

      {empty ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Aucune remise ni retour prévu pour aujourd&apos;hui ou demain.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {agenda.overdue.length > 0 && (
            <Group title="En retard" icon={<AlertTriangle className="w-3.5 h-3.5" />} tone="danger">
              {agenda.overdue.map((it) => (
                <Row key={it.id} item={it} today={today} tomorrow={tomorrow} verb="retour en retard de" overdue />
              ))}
            </Group>
          )}
          {agenda.pickups.length > 0 && (
            <Group title="Remises à venir" icon={<KeyRound className="w-3.5 h-3.5" />} tone="accent">
              {agenda.pickups.map((it) => (
                <Row key={it.id} item={it} today={today} tomorrow={tomorrow} verb="récupère" />
              ))}
            </Group>
          )}
          {agenda.returns.length > 0 && (
            <Group title="Retours attendus" icon={<CornerDownLeft className="w-3.5 h-3.5" />} tone="accent">
              {agenda.returns.map((it) => (
                <Row key={it.id} item={it} today={today} tomorrow={tomorrow} verb="retour de" />
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  )
}

function Group({ title, icon, tone, children }: { title: string; icon: React.ReactNode; tone: 'accent' | 'danger'; children: React.ReactNode }) {
  const color = tone === 'danger' ? '#fb7185' : 'var(--accent)'
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color }}>
        {icon}{title}
      </p>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  )
}

function Row({
  item, today, tomorrow, verb, overdue,
}: {
  item: AgendaItem
  today: string
  tomorrow: string
  verb: string
  overdue?: boolean
}) {
  const day = relativeDayLabel(item.date, today, tomorrow)
  return (
    <li>
      <Link
        href={`/dashboard/location/contrats/${item.id}`}
        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--bg-elevated)]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <span className="min-w-0 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span className="font-semibold" style={{ color: overdue ? '#fb7185' : 'var(--text-primary)' }}>{day}</span>
          {item.time ? <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}> {item.time}</span> : null}
          {' — '}
          <span style={{ color: 'var(--text-primary)' }}>{item.customer_name}</span> {verb}{' '}
          <bdi>{item.vehicle_label}</bdi>
        </span>
        {item.contract_number && (
          <span className="text-[11px] font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{item.contract_number}</span>
        )}
      </Link>
    </li>
  )
}
