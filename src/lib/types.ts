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
  created_at: string
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
  vendu:        'bg-rose-600 text-white border-rose-700 dark:bg-rose-600 dark:text-white dark:border-rose-700',
  perdu:        'bg-slate-500 text-white border-slate-600 dark:bg-slate-600 dark:text-white dark:border-slate-700',
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
