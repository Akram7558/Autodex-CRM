// ── Public catalog opening-hours JSONB ──────────────────────────────
// Keys are French day names (lowercase). Values are either "HH:MM-HH:MM"
// or the literal "fermé" (closed). Free-form-tolerant so the form can
// trim and the public renderer falls back gracefully.
export type ShowroomOpeningHours = Partial<Record<
  'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi' | 'dimanche',
  string
>>

export type Showroom = {
  id: string
  name: string
  city?: string
  address?: string | null
  phone?: string | null
  // Multi-tenant SaaS fields (migration_12_rbac.sql)
  owner_email?: string | null
  module_vente?: boolean
  module_location?: boolean
  active?: boolean
  // Public-catalog fields (migration_25_public_catalog.sql)
  slug?: string | null
  whatsapp?: string | null
  google_maps_url?: string | null
  logo_url?: string | null
  opening_hours?: ShowroomOpeningHours | null
  catalog_enabled?: boolean
  // Trial tracking (migration_22_trial_system.sql)
  is_trial?: boolean
  trial_ends_at?: string | null
  trial_converted_at?: string | null
  trial_contract_amount?: number | null
  trial_converted_by?: string | null
  // Subscription plan (migration_23_plans.sql) — stamped on trial
  // conversion via /api/admin/convert-trial.
  plan_id?: string | null
  created_at: string
}

// ── Public catalog (migration_25_public_catalog.sql) ────────────────
// `budget_dedouanement` added by migration_26_preorder_fields.sql —
// optional customs / clearance budget in DZD, shown alongside the price
// on both the dashboard card and the public catalog.
export type PreorderVehicle = {
  id: string
  showroom_id: string
  marque: string
  modele: string
  annee: number | null
  prix_estime: number | null
  budget_dedouanement: number | null
  description: string | null
  image_url: string | null
  delai_livraison: string | null
  disponible: boolean
  created_at: string
  updated_at: string
}

/** Subset of `Showroom` columns that owners edit on /dashboard/parametres. */
export type ShowroomPublicInfo = {
  id: string
  name: string
  slug: string | null
  city: string | null
  phone: string | null
  whatsapp: string | null
  address: string | null
  google_maps_url: string | null
  logo_url: string | null
  opening_hours: ShowroomOpeningHours | null
  catalog_enabled: boolean
}

export type CatalogOrderType = 'vehicle' | 'preorder'
export type CatalogOrderInput = {
  full_name: string
  phone: string
  message?: string | null
  vehicle_id?: string | null
  preorder_id?: string | null
  type: CatalogOrderType
}

// ── SaaS subscription plans (migration_23_plans.sql, plan_type added in 24) ──
export type SaasPlanType = 'classique' | 'totale'
export const SAAS_PLAN_TYPE_VALUES: SaasPlanType[] = ['classique', 'totale']
export const SAAS_PLAN_TYPE_LABELS: Record<SaasPlanType, string> = {
  classique: 'Plan Classique',
  totale:    'Plan La Totale',
}

export type SaasPlan = {
  id: string
  name: string
  duration_months: number
  price: number
  active: boolean
  plan_type: SaasPlanType
  created_at: string
  updated_at: string
}

// ── RBAC roles (migration_12_rbac.sql + migration_15_internal_roles.sql)
// Internal AutoDex team:  super_admin, commercial, prospecteur_saas
//                         (showroom_id is null)
// Showroom team:          owner, manager, closer, prospecteur
//                         (showroom_id is required)
export type AppRole =
  | 'super_admin'
  | 'commercial'
  | 'prospecteur_saas'
  | 'owner'
  | 'manager'
  | 'closer'
  | 'prospecteur'

export type UserRole = {
  id: string
  user_id: string
  showroom_id: string | null   // null for super_admin (global)
  role: AppRole
  created_at: string
}

export type LeadDistribution = {
  id: string
  showroom_id: string
  user_id: string
  percentage: number
  leads_received: number
  created_at: string
}

export type AppUser = {
  id: string
  showroom_id: string | null
  email: string
  full_name: string
  role: 'admin' | 'manager' | 'agent'
  avatar_url: string | null
  is_active: boolean
  created_at: string
}

export type Vehicle = {
  id: string
  showroom_id: string | null
  brand: string
  model: string
  year: number | null
  color: string | null
  vin: string | null
  price_dzd: number | null
  status: 'available' | 'reserved' | 'sold'
  created_at: string
  image_url: string | null
  reserved_by_lead_id: string | null
  kilometrage: number | null
  etat_carrosserie: string | null
  finition: string | null
  carte_grise: string | null
  type_moteur: string | null
  // field added by migration_09_vehicles_reference.sql — auto-generated code
  reference: string | null
  // field added by migration_20_ventes_rls_motorisation.sql — engine designation
  // (e.g. "1.0 TCe", "1.5 TSi", "2.0 TDi"). Free-form text, optional.
  motorisation: string | null
}

export type LeadSource =
  | 'walk-in'
  | 'phone'
  | 'website'
  | 'referral'
  | 'social'
  | 'facebook'
  | 'instagram'
  | 'whatsapp'
  | 'telephone'

// Catalog order discriminator (migration_27_lead_order_type.sql).
// 'vehicle'  → ordered an in-stock vehicle from /s/[slug]
// 'preorder' → placed a pre-order from /s/[slug]
// null       → regular lead (manual entry, ad campaign, etc.)
export type LeadOrderType = 'vehicle' | 'preorder'

// Lead temperature bucket (migration_28_lead_temperature.sql).
//   chaud = score ≥ 70  · 🔥
//   tiede = score 40-69 · 🟡
//   froid = score < 40  · 🧊
export type LeadTemperature = 'chaud' | 'tiede' | 'froid'

export const LEAD_TEMPERATURE_LABELS: Record<LeadTemperature, string> = {
  chaud: '🔥 Chaud',
  tiede: '🟡 Tiède',
  froid: '🧊 Froid',
}

export const LEAD_TEMPERATURE_VALUES: LeadTemperature[] = ['chaud', 'tiede', 'froid']

// Solid-fill badge classes (white text). Used on the prospects table
// row badge and on the dashboard temperature widget chips.
export const LEAD_TEMPERATURE_BADGE_CLASSES: Record<LeadTemperature, string> = {
  chaud: 'bg-rose-500 text-white border-rose-600',
  tiede: 'bg-amber-500 text-white border-amber-600',
  froid: 'bg-blue-500 text-white border-blue-600',
}

// migration_29 — score history (sparkline data source).
export type LeadTemperatureHistoryEntry = {
  score: number
  temperature: LeadTemperature
  recorded_at: string
}

// migration_29 — vehicle / pre-order matching suggestions.
export type VehicleSuggestion = {
  vehicle: Vehicle
  match_score: number
  match_reasons: string[]
}
export type PreorderSuggestion = {
  preorder: PreorderVehicle
  match_score: number
  match_reasons: string[]
}

export type Lead = {
  id: string
  showroom_id: string | null
  assigned_to: string | null
  vehicle_id: string | null
  full_name: string
  phone: string | null
  email: string | null
  wilaya: string | null
  source: LeadSource
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
  notes: string | null
  // Catalog order discriminator (migration 27). Null for regular leads.
  order_type: LeadOrderType | null
  // Auto-computed lead temperature (migration 28). Default 50/tiede on
  // insert; recalculated on suivi change, new activity, manual refresh,
  // and the nightly cron. `manual_temperature_override` halts the auto
  // recalc when the owner has set the bucket by hand.
  temperature_score: number | null
  temperature: LeadTemperature | null
  temperature_updated_at: string | null
  manual_temperature_override: boolean | null
  froid_since: string | null
  // Smart reminders (migration 34). Reset by trg_activities_signal
  // when the assignee finally contacts the lead.
  reminder_count: number | null
  last_reminder_at: string | null
  escalated: boolean | null
  escalated_at: string | null
  // migration_29_ai_features.sql
  last_contacted_at: string | null
  hot_alert_sent: boolean | null
  best_call_hour: number | null
  // fields added by migration_01_kanban.sql
  model_wanted: string | null
  budget_dzd: number | null
  // field added by migration_07_leads_suivi.sql — independent follow-up tracker
  suivi: LeadSuivi | null
  // field added by migration_08_leads_rdv_date.sql — scheduled appointment time
  rdv_date: string | null
  // field added by migration_11_leads_depot.sql — deposit paid on reservation
  depot_amount: number | null
  created_at: string
  updated_at: string
}

// ── Suivi (follow-up attempts) — distinct from sales pipeline `status` ───
export type LeadSuivi =
  | 'tentative_1'
  | 'tentative_2'
  | 'tentative_3'
  | 'reporter'
  | 'rdv_planifie'
  | 'vendu'
  | 'perdu'

export const LEAD_SUIVI_LABELS: Record<LeadSuivi, string> = {
  tentative_1:  'Tentative 1',
  tentative_2:  'Tentative 2',
  tentative_3:  'Tentative 3',
  reporter:     'Reporter',
  rdv_planifie: 'RDV planifié',
  vendu:        'Vendu',
  perdu:        'Perdu',
}

export const LEAD_SUIVI_VALUES: LeadSuivi[] = [
  'tentative_1', 'tentative_2', 'tentative_3', 'reporter', 'rdv_planifie', 'vendu', 'perdu',
]

export const LEAD_SUIVI_BADGE_CLASSES: Record<LeadSuivi, string> = {
  tentative_1:  'bg-yellow-300 text-yellow-900 border-yellow-400 dark:bg-yellow-400 dark:text-yellow-950 dark:border-yellow-500',
  tentative_2:  'bg-orange-500 text-white border-orange-600 dark:bg-orange-500 dark:text-white dark:border-orange-600',
  tentative_3:  'bg-red-600 text-white border-red-700 dark:bg-red-600 dark:text-white dark:border-red-700',
  reporter:     'bg-orange-700 text-white border-orange-800 dark:bg-orange-700 dark:text-white dark:border-orange-800',
  rdv_planifie: 'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-600 dark:text-white dark:border-emerald-700',
  // Emerald to match the "Vendu" status color used on /dashboard/rendez-vous
  // (RDV row Statut dropdown). Was rose, but the showroom-side suivi badge
  // should reflect the same colour as a closed sale elsewhere in the app.
  vendu:        'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-600 dark:text-white dark:border-emerald-700',
  perdu:        'bg-slate-500 text-white border-slate-600 dark:bg-slate-600 dark:text-white dark:border-slate-700',
}

// ── SaaS pipeline (migration_16_saas_prospects.sql) ─────────────────
// Internal AutoDex team uses these tables to track potential showroom
// clients (NOT the showrooms' own customers).

export type SaasSuivi =
  | 'nouveau'
  | 'tentative_1'
  | 'tentative_2'
  | 'tentative_3'
  | 'reporter'
  | 'rdv_planifie'
  | 'annule'

export const SAAS_SUIVI_VALUES: SaasSuivi[] = [
  'nouveau','tentative_1','tentative_2','tentative_3','reporter','rdv_planifie','annule',
]

export const SAAS_SUIVI_LABELS: Record<SaasSuivi, string> = {
  nouveau:      'Nouveau',
  tentative_1:  'Tentative 1',
  tentative_2:  'Tentative 2',
  tentative_3:  'Tentative 3',
  reporter:     'Reporter',
  rdv_planifie: 'RDV planifié',
  annule:       'Annulé',
}

// Mirrors LEAD_SUIVI_BADGE_CLASSES on the showroom leads page so the
// SaaS pipeline reads at a glance for anyone used to the showroom UI.
// `annule` reuses the rose/red palette historically used for "perdu".
export const SAAS_SUIVI_BADGE: Record<SaasSuivi, string> = {
  nouveau:      'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30',
  tentative_1:  'bg-yellow-300 text-yellow-900 border-yellow-400 dark:bg-yellow-400 dark:text-yellow-950 dark:border-yellow-500',
  tentative_2:  'bg-orange-500 text-white border-orange-600 dark:bg-orange-500 dark:text-white dark:border-orange-600',
  tentative_3:  'bg-red-600 text-white border-red-700 dark:bg-red-600 dark:text-white dark:border-red-700',
  reporter:     'bg-orange-700 text-white border-orange-800 dark:bg-orange-700 dark:text-white dark:border-orange-800',
  rdv_planifie: 'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-600 dark:text-white dark:border-emerald-700',
  annule:       'bg-rose-600 text-white border-rose-700 dark:bg-rose-600 dark:text-white dark:border-rose-700',
}

// ── Cancellation reasons ────────────────────────────────────────────
// Used by the cancellation modal AND by the PATCH route's server-side
// enum check — keep the value list in sync.
export type SaasCancellationReason =
  | 'prix_trop_eleve'
  | 'pas_interesse'
  | 'autre_solution'
  | 'pas_le_bon_moment'
  | 'injoignable'
  | 'autre'

export const SAAS_CANCELLATION_REASON_VALUES: SaasCancellationReason[] = [
  'prix_trop_eleve','pas_interesse','autre_solution','pas_le_bon_moment','injoignable','autre',
]

export const SAAS_CANCELLATION_REASONS: { value: SaasCancellationReason; label: string }[] = [
  { value: 'prix_trop_eleve',   label: 'Prix trop élevé' },
  { value: 'pas_interesse',     label: 'Pas intéressé' },
  { value: 'autre_solution',    label: "A trouvé une autre solution" },
  { value: 'pas_le_bon_moment', label: 'Pas le bon moment' },
  { value: 'injoignable',       label: 'Injoignable' },
  { value: 'autre',             label: 'Autre' },
]

export const SAAS_CANCELLATION_REASON_LABELS: Record<SaasCancellationReason, string> =
  Object.fromEntries(
    SAAS_CANCELLATION_REASONS.map((r) => [r.value, r.label]),
  ) as Record<SaasCancellationReason, string>

export type SaasSource =
  | 'facebook_ads'
  | 'tiktok_ads'
  | 'landing_page'
  | 'manuel'
  | 'reference'
  | 'autre'

export const SAAS_SOURCE_VALUES: SaasSource[] = [
  'facebook_ads','tiktok_ads','landing_page','manuel','reference','autre',
]

export const SAAS_SOURCE_LABELS: Record<SaasSource, string> = {
  facebook_ads: 'Facebook Ads',
  tiktok_ads:   'TikTok Ads',
  landing_page: 'Landing Page',
  manuel:       'Manuel',
  reference:    'Référence',
  autre:        'Autre',
}

export type SaasShowroomSize = 'petit' | 'moyen' | 'grand'
export const SAAS_SIZE_VALUES: SaasShowroomSize[] = ['petit', 'moyen', 'grand']
export const SAAS_SIZE_LABELS: Record<SaasShowroomSize, string> = {
  petit: 'Petit (< 50)',
  moyen: 'Moyen (50–150)',
  grand: 'Grand (150+)',
}

export type SaasProspect = {
  id: string
  full_name: string
  phone: string
  city: string | null
  showroom_name: string
  showroom_size: SaasShowroomSize | null
  email: string | null
  notes: string | null
  suivi: SaasSuivi
  source: SaasSource
  assigned_to: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Cancellation tracking (migration_17_prospect_cancellation.sql).
  cancellation_reason?:  SaasCancellationReason | null
  cancellation_comment?: string | null
  cancelled_at?:         string | null
  cancelled_by?:         string | null
}

export type SaasRdvStatus = 'planifie' | 'converti' | 'essai_gratuit' | 'reporter' | 'annule'

export const SAAS_RDV_STATUS_VALUES: SaasRdvStatus[] = [
  'planifie','converti','essai_gratuit','reporter','annule',
]

export const SAAS_RDV_STATUS_LABELS: Record<SaasRdvStatus, string> = {
  planifie:       'Planifié',
  converti:       'Converti',
  essai_gratuit:  'Essai gratuit',
  reporter:       'Reporter',
  annule:         'Annulé',
}

export const SAAS_RDV_STATUS_BADGE: Record<SaasRdvStatus, string> = {
  planifie:       'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
  converti:       'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
  essai_gratuit:  'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30',
  reporter:       'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
  annule:         'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30',
}

export type SaasRdv = {
  id: string
  prospect_id: string
  scheduled_at: string
  status: SaasRdvStatus
  notes: string | null
  assigned_to: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Set when the RDV converted to a trial via /api/admin/start-trial.
  linked_showroom_id?: string | null
}

// ── SaaS RDV distribution (migration_18) ────────────────────────────
export type SaasDistributionEntry = {
  id: string
  user_id: string
  email: string | null            // resolved from auth.users
  percentage: number              // 0..100
  active: boolean
  last_assigned_at: string | null
  rdv_count_total: number
  rdv_count_30days: number
}

export type SaasDistributionPreview = {
  user_id:    string | null
  email:      string | null
  percentage: number | null
}

// ── SaaS prospect distribution (migration_19) ────────────────────────
export type SaasProspectDistributionEntry = {
  id: string
  user_id: string
  email: string | null
  percentage: number
  active: boolean
  last_assigned_at: string | null
  prospect_count_total: number
  prospect_count_30days: number
}

export type SaasProspectDistributionPreview = SaasDistributionPreview

export type SaasActivity = {
  id: string
  prospect_id: string | null
  rdv_id: string | null
  type: string
  description: string
  metadata: Record<string, unknown> | null
  user_id: string | null
  created_at: string
}

export type Vente = {
  id: string
  lead_id: string | null
  vehicle_id: string | null
  client_name: string | null
  vehicle_name: string | null
  vehicle_reference: string | null
  prix_vente: number | null
  date_vente: string
}

export type Activity = {
  id: string
  lead_id: string | null
  user_id: string | null
  type: 'call' | 'email' | 'meeting' | 'note' | 'status_change'
  title: string
  body: string | null
  scheduled_at: string | null
  done: boolean
  created_at: string
  // joined relations
  leads?: { full_name: string } | null
  users?: { full_name: string } | null
}

// ── Display labels ───────────────────────────────────────────────

export const LEAD_STATUS_LABELS: Record<Lead['status'], string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  qualified: 'RDV planifié',
  proposal: 'Offre faite',
  won: 'Vendu',
  lost: 'Perdu',
}

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  'walk-in':   'Showroom',
  phone:       'Téléphone',
  website:     'Site web',
  referral:    'Recommandation',
  social:      'Réseaux sociaux',
  facebook:    'Facebook',
  instagram:   'Instagram',
  whatsapp:    'WhatsApp',
  telephone:   'Téléphone',
}

export const VEHICLE_STATUS_LABELS: Record<Vehicle['status'], string> = {
  available: 'Disponible',
  reserved:  'Réservé',
  sold:      'Vendu',
}

export const ACTIVITY_TYPE_LABELS: Record<Activity['type'], string> = {
  call:          'Appel',
  email:         'Email',
  meeting:       'Réunion',
  note:          'Note',
  status_change: 'Changement statut',
}

// ── Notifications / alerts ───────────────────────────────────────

export type NotificationType =
  | 'lead_ignored'
  | 'lead_stagnant'
  | 'stock_rupture'
  | 'vendor_inactive'
  | 'reminder'     // migration 34 — assignee-targeted reminder
  | 'escalation'   // migration 34 — owner+manager escalation

export type Notification = {
  id: string
  showroom_id: string | null
  user_id: string | null
  type: NotificationType
  title: string
  message: string
  lead_id: string | null
  vehicle_id: string | null
  dedupe_key: string | null
  read: boolean
  created_at: string
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  lead_ignored:    'Lead ignoré',
  lead_stagnant:   'Lead stagnant',
  stock_rupture:   'Rupture de stock',
  vendor_inactive: 'Vendeur inactif',
  reminder:        'Rappel',
  escalation:      'Escalade',
}

// ── Integrations (Meta OAuth) ────────────────────────────────────

export type IntegrationProvider = 'whatsapp' | 'messenger' | 'instagram'

export type Integration = {
  id: string
  showroom_id: string
  provider: IntegrationProvider
  account_name: string | null
  account_id: string | null
  phone_number: string | null
  access_token: string | null
  expires_at: string | null
  is_active: boolean
  connected_at: string
}

export const INTEGRATION_PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  whatsapp:  'WhatsApp Business',
  messenger: 'Facebook Messenger',
  instagram: 'Instagram Business',
}

// ── 58 Wilayas d'Algérie ─────────────────────────────────────────
export const WILAYAS_58: string[] = [
  'Adrar', 'Chlef', 'Laghouat', 'Oum El Bouaghi', 'Batna', 'Béjaïa',
  'Biskra', 'Béchar', 'Blida', 'Bouira', 'Tamanrasset', 'Tébessa',
  'Tlemcen', 'Tiaret', 'Tizi Ouzou', 'Alger', 'Djelfa', 'Jijel',
  'Sétif', 'Saïda', 'Skikda', 'Sidi Bel Abbès', 'Annaba', 'Guelma',
  'Constantine', 'Médéa', 'Mostaganem', "M'Sila", 'Mascara', 'Ouargla',
  'Oran', 'El Bayadh', 'Illizi', 'Bordj Bou Arréridj', 'Boumerdès',
  'El Tarf', 'Tindouf', 'Tissemsilt', 'El Oued', 'Khenchela',
  'Souk Ahras', 'Tipaza', 'Mila', 'Aïn Defla', 'Naâma',
  'Aïn Témouchent', 'Ghardaïa', 'Relizane', 'Timimoun',
  'Bordj Badji Mokhtar', 'Ouled Djellal', 'Béni Abbès', 'In Salah',
  'In Guezzam', 'Touggourt', 'Djanet', "El M'ghair", 'El Menia',
]
