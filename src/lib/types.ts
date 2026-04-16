export type Showroom = {
  id: string
  name: string
  city: string
  address: string | null
  phone: string | null
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
  source: 'walk-in' | 'phone' | 'website' | 'referral' | 'social'
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
  notes: string | null
  created_at: string
  updated_at: string
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
  // joined
  leads?: { full_name: string } | null
  users?: { full_name: string } | null
}

export const LEAD_STATUS_LABELS: Record<Lead['status'], string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  qualified: 'Qualifié',
  proposal: 'Offre',
  won: 'Gagné',
  lost: 'Perdu',
}

export const LEAD_SOURCE_LABELS: Record<Lead['source'], string> = {
  'walk-in': 'Showroom',
  phone: 'Téléphone',
  website: 'Site web',
  referral: 'Recommandation',
  social: 'Réseaux sociaux',
}

export const VEHICLE_STATUS_LABELS: Record<Vehicle['status'], string> = {
  available: 'Disponible',
  reserved: 'Réservé',
  sold: 'Vendu',
}

export const ACTIVITY_TYPE_LABELS: Record<Activity['type'], string> = {
  call: 'Appel',
  email: 'Email',
  meeting: 'Réunion',
  note: 'Note',
  status_change: 'Changement statut',
}
